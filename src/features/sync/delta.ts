import type { HevyClient } from '@furkantanyol/hevy-client';

import { applyDeletes, applyWorkouts } from './apply';
import { readSyncState, writeSyncState } from './sync-state';

import type { SyncDatabase } from '@/db/schema';

export type DeltaClient = { workouts: Pick<HevyClient['workouts'], 'changes'> };

export type DeltaSummary = {
  upserted: number;
  deleted: number;
};

/**
 * Pulls everything that changed since the stored cursor. Hevy's events are inclusive of the cursor
 * instant, so the event sitting exactly on it can arrive twice; applying is idempotent, so a
 * duplicate costs one wasted upsert and nothing else.
 */
export async function runDelta(db: SyncDatabase, client: DeltaClient): Promise<DeltaSummary> {
  const { workoutsCursor } = readSyncState(db);
  const changes = await client.workouts.changes(workoutsCursor ?? undefined);

  // Upserts and tombstones land together: a workout updated and then deleted must not survive
  // because the two halves committed separately.
  db.transaction((tx) => {
    applyWorkouts(tx, changes.upserts);
    applyDeletes(
      tx,
      changes.deletes.map((event) => event.id)
    );
  });

  // Only now. A cursor moved before the rows landed would skip those events forever.
  const cursor = changes.cursor ?? workoutsCursor;

  if (cursor !== workoutsCursor) {
    writeSyncState(db, { workoutsCursor: cursor });
  }

  return { upserted: changes.upserts.length, deleted: changes.deletes.length };
}
