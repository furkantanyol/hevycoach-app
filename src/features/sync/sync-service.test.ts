import { HevyNetworkError, type ExerciseTemplate, type Routine } from '@furkantanyol/hevy-client';

import { saveRoutineTitle } from './outbox';
import { toRoutineRow } from './mappers';
import { runSync, type SyncClient } from './sync-service';
import { readSyncState, writeSyncState } from './sync-state';
import { buildRoutine, buildWorkout, createTestDatabase } from './test-support';

import { exerciseTemplates, outbox, routines } from '@/db/schema';

const TEMPLATE: ExerciseTemplate = {
  id: '05293BCA',
  title: 'Bench Press (Barbell)',
  type: 'weight_reps',
  primary_muscle_group: 'chest',
  secondary_muscle_groups: ['triceps'],
  equipment: 'barbell',
  is_custom: false,
};

function buildClient(options: { calls?: string[]; serverRoutines?: Routine[] } = {}): SyncClient {
  const record = (name: string) => options.calls?.push(name);

  return {
    workouts: {
      list: (params) => {
        record('workouts.list');

        return Promise.resolve({
          page: params?.page ?? 1,
          page_count: 1,
          workouts: [buildWorkout()],
        });
      },
      changes: () => {
        record('workouts.changes');

        return Promise.resolve({ upserts: [], deletes: [], cursor: '2026-09-09T12:00:00Z' });
      },
    },
    exerciseTemplates: {
      listAll: () => {
        record('exerciseTemplates.listAll');

        return Promise.resolve([TEMPLATE]);
      },
    },
    routines: {
      listAll: () => {
        record('routines.listAll');

        return Promise.resolve(options.serverRoutines ?? [buildRoutine()]);
      },
      update: (routineId) => {
        record('routines.update');

        return Promise.resolve(buildRoutine({ id: routineId }));
      },
    },
  };
}

describe('runSync', () => {
  it('should push queued writes before pulling anything down', async () => {
    const db = createTestDatabase();
    const calls: string[] = [];

    saveRoutineTitle(db, toRoutineRow(buildRoutine()), 'Upper Body B');
    await runSync(db, buildClient({ calls }));

    expect(calls).toEqual([
      'routines.update',
      'exerciseTemplates.listAll',
      'routines.listAll',
      'workouts.list',
      'workouts.changes',
    ]);
  });

  it('should not overwrite a routine whose rename has not shipped yet', async () => {
    const db = createTestDatabase();
    const routine = toRoutineRow(buildRoutine());
    const client = buildClient();

    db.insert(routines).values(routine).run();
    saveRoutineTitle(db, routine, 'Upper Body B');
    client.routines.update = () => Promise.reject(new Error('routine-limit-exceeded'));

    await runSync(db, client);

    expect(db.select().from(routines).all()[0].title).toBe('[TEST] Upper Body B');
  });

  it('should leave the exercise library alone until it is a day old', async () => {
    const db = createTestDatabase();
    const calls: string[] = [];

    writeSyncState(db, { templatesSyncedAt: new Date() });
    await runSync(db, buildClient({ calls }));

    expect(calls).not.toContain('exerciseTemplates.listAll');
    expect(db.select().from(exerciseTemplates).all()).toEqual([]);
  });

  it('should refresh the exercise library once it is stale', async () => {
    const db = createTestDatabase();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    writeSyncState(db, { templatesSyncedAt: twoDaysAgo });
    await runSync(db, buildClient());

    expect(db.select().from(exerciseTemplates).all()).toHaveLength(1);
  });

  it('should report offline and keep the queue when the network is down', async () => {
    const db = createTestDatabase();
    const client = buildClient();

    saveRoutineTitle(db, toRoutineRow(buildRoutine()), 'Upper Body B');
    client.routines.update = () => Promise.reject(new HevyNetworkError(new Error('offline')));

    const summary = await runSync(db, client);

    expect(summary.status).toBe('offline');
    expect(db.select().from(outbox).all()[0].attempts).toBe(0);
    expect(readSyncState(db).lastSyncAt).toBeNull();
  });

  it('should record the moment of a clean pass', async () => {
    const db = createTestDatabase();

    await runSync(db, buildClient());

    expect(readSyncState(db).lastSyncAt).not.toBeNull();
    expect(readSyncState(db).lastError).toBeNull();
  });
});
