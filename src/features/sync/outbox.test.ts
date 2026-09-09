import { HevyNetworkError } from '@furkantanyol/hevy-client';
import { asc, eq } from 'drizzle-orm';

import { MAX_ATTEMPTS } from './backoff';
import { drainOutbox, enqueueRoutineUpdate, saveRoutineTitle, type OutboxClient } from './outbox';
import { toRoutineRow } from './mappers';
import { buildRoutine, createTestDatabase } from './test-support';

import { outbox, routines, type SyncDatabase } from '@/db/schema';

function readQueue(db: SyncDatabase) {
  return db.select().from(outbox).orderBy(asc(outbox.id)).all();
}

function acceptingClient(): OutboxClient & { updated: string[] } {
  const updated: string[] = [];

  return {
    updated,
    routines: {
      update: (routineId) => {
        updated.push(routineId);

        return Promise.resolve(buildRoutine({ id: routineId }));
      },
    },
  };
}

const rejectingClient: OutboxClient = {
  routines: { update: () => Promise.reject(new Error('routine-limit-exceeded')) },
};

describe('enqueueRoutineUpdate', () => {
  it('should keep one row per routine, holding the newest edit', () => {
    const db = createTestDatabase();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ title: 'First' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ title: 'Second' })));

    const queue = readQueue(db);

    expect(queue).toHaveLength(1);
    expect(queue[0].payload.title).toBe('Second');
  });

  it('should send a re-edited routine last, so the queue stays first in first out', async () => {
    const db = createTestDatabase();
    const client = acceptingClient();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'b' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a', title: 'Edited again' })));

    await drainOutbox(db, client);

    expect(client.updated).toEqual(['b', 'a']);
  });
});

describe('saveRoutineTitle', () => {
  it('should prefix a title that Hevy has not seen the guard on', () => {
    const db = createTestDatabase();

    saveRoutineTitle(db, toRoutineRow(buildRoutine()), 'Upper Body B');

    expect(readQueue(db)[0].payload.title).toBe('[TEST] Upper Body B');
  });

  it('should not stack the prefix on a title that already carries it', () => {
    const db = createTestDatabase();

    saveRoutineTitle(db, toRoutineRow(buildRoutine()), '[TEST] Upper Body B');

    expect(readQueue(db)[0].payload.title).toBe('[TEST] Upper Body B');
  });

  it('should rename the local routine straight away, before anything reaches Hevy', () => {
    const db = createTestDatabase();
    const routine = toRoutineRow(buildRoutine());

    db.insert(routines).values(routine).run();
    saveRoutineTitle(db, routine, 'Upper Body B');

    expect(db.select().from(routines).all()[0].title).toBe('[TEST] Upper Body B');
  });
});

describe('drainOutbox', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should send queued rows oldest first and clear them', async () => {
    const db = createTestDatabase();
    const client = acceptingClient();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'b' })));

    const summary = await drainOutbox(db, client);

    expect(client.updated).toEqual(['a', 'b']);
    expect(summary).toEqual({ status: 'drained', sent: 2, failed: 0, pending: 0, dead: 0 });
  });

  it('should back the failed row off and stop, so a later write cannot overtake it', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const db = createTestDatabase();
    const before = Date.now();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'b' })));

    const summary = await drainOutbox(db, rejectingClient);
    const queue = readQueue(db);

    expect(summary).toEqual({ status: 'drained', sent: 0, failed: 1, pending: 2, dead: 0 });
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe('routine-limit-exceeded');
    expect(queue[0].nextAttemptAt.getTime()).toBeGreaterThan(before);
    expect(queue[1].attempts).toBe(0);
  });

  it('should leave a row that has run out of attempts alone and report it dead', async () => {
    const db = createTestDatabase();
    const client = acceptingClient();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'b' })));
    db.update(outbox).set({ attempts: MAX_ATTEMPTS }).where(eq(outbox.entityId, 'a')).run();

    const summary = await drainOutbox(db, client);

    expect(client.updated).toEqual(['b']);
    expect(summary).toEqual({ status: 'drained', sent: 1, failed: 0, pending: 0, dead: 1 });
  });

  it('should give a re-edited routine a fresh attempt budget, which is the way back from dead', async () => {
    const db = createTestDatabase();
    const client = acceptingClient();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));
    db.update(outbox).set({ attempts: MAX_ATTEMPTS }).where(eq(outbox.entityId, 'a')).run();
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a', title: 'Edited again' })));

    const summary = await drainOutbox(db, client);

    expect(client.updated).toEqual(['a']);
    expect(summary.dead).toBe(0);
  });

  it('should hold the whole queue behind a row that is still serving its backoff', async () => {
    const db = createTestDatabase();
    const client = acceptingClient();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));
    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'b' })));
    db.update(outbox)
      .set({ attempts: 1, nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(outbox.entityId, 'a'))
      .run();

    const summary = await drainOutbox(db, client);

    expect(client.updated).toEqual([]);
    expect(summary).toEqual({ status: 'drained', sent: 0, failed: 0, pending: 2, dead: 0 });
  });

  it('should stop without spending an attempt when the network is down', async () => {
    const db = createTestDatabase();

    enqueueRoutineUpdate(db, toRoutineRow(buildRoutine({ id: 'a' })));

    const summary = await drainOutbox(db, {
      routines: { update: () => Promise.reject(new HevyNetworkError(new Error('offline'))) },
    });

    expect(summary).toEqual({ status: 'offline', sent: 0, failed: 0, pending: 1, dead: 0 });
    expect(readQueue(db)[0].attempts).toBe(0);
  });
});
