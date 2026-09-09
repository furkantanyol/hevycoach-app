import { HevyNetworkError, type HevyClient } from '@furkantanyol/hevy-client';
import { and, asc, eq, lt, lte } from 'drizzle-orm';

import { MAX_ATTEMPTS, nextAttemptDelayMs } from './backoff';
import { toRoutineUpdateInput } from './mappers';

import { outbox, routines, type OutboxRow, type RoutineRow, type SyncDatabase } from '@/db/schema';

export type OutboxClient = { routines: Pick<HevyClient['routines'], 'update'> };

/**
 * Guard on every write that leaves the device: until the account owner lifts it, a routine this
 * app touches is renamed so it is obvious in Hevy which routines came from here.
 */
const TEST_PREFIX = '[TEST]';

export type DrainSummary = {
  sent: number;
  failed: number;
  pending: number;
  dead: number;
};

/**
 * Queues a routine update. Any pending update for the same routine is dropped first, so the last
 * edit wins and the row moves to the tail — which keeps the queue FIFO across different routines.
 */
export function enqueueRoutineUpdate(db: SyncDatabase, routine: RoutineRow): void {
  const now = new Date();

  db.transaction((tx) => {
    tx.delete(outbox)
      .where(and(eq(outbox.entityType, 'routine'), eq(outbox.entityId, routine.id)))
      .run();

    tx.insert(outbox)
      .values({
        entityType: 'routine',
        entityId: routine.id,
        operation: 'update',
        payload: toRoutineUpdateInput(routine),
        createdAt: now,
        nextAttemptAt: now,
      })
      .run();
  });
}

/** Renames a routine locally and queues the same change for Hevy, in one transaction. */
export function saveRoutineTitle(db: SyncDatabase, routine: RoutineRow, title: string): void {
  const guarded = title.startsWith(TEST_PREFIX) ? title : `${TEST_PREFIX} ${title}`;

  db.transaction((tx) => {
    tx.update(routines).set({ title: guarded }).where(eq(routines.id, routine.id)).run();
    enqueueRoutineUpdate(tx, { ...routine, title: guarded });
  });
}

/**
 * Sends queued writes oldest first, one at a time. The first failure stops the drain: a later write
 * must never overtake an earlier one, and whatever knocked this row back will knock the next one
 * back too.
 */
export async function drainOutbox(db: SyncDatabase, client: OutboxClient): Promise<DrainSummary> {
  const ready = db
    .select()
    .from(outbox)
    .where(and(lt(outbox.attempts, MAX_ATTEMPTS), lte(outbox.nextAttemptAt, new Date())))
    .orderBy(asc(outbox.id))
    .all();

  let sent = 0;

  for (const row of ready) {
    try {
      await client.routines.update(row.entityId, row.payload);
      db.delete(outbox).where(eq(outbox.id, row.id)).run();
      sent += 1;
    } catch (caught) {
      // Being offline is not this row's fault, so it keeps its attempts and runSync reports it.
      if (caught instanceof HevyNetworkError) {
        throw caught;
      }

      recordFailure(db, row, caught);

      return { sent, failed: 1, ...countQueue(db) };
    }
  }

  return { sent, failed: 0, ...countQueue(db) };
}

function recordFailure(db: SyncDatabase, row: OutboxRow, caught: unknown): void {
  const attempts = row.attempts + 1;

  db.update(outbox)
    .set({
      attempts,
      nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs(attempts)),
      lastError: caught instanceof Error ? caught.message : String(caught),
    })
    .where(eq(outbox.id, row.id))
    .run();
}

function countQueue(db: SyncDatabase): { pending: number; dead: number } {
  const rows = db.select({ attempts: outbox.attempts }).from(outbox).all();

  return {
    pending: rows.filter((row) => row.attempts < MAX_ATTEMPTS).length,
    dead: rows.filter((row) => row.attempts >= MAX_ATTEMPTS).length,
  };
}
