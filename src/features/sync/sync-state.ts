import { eq } from 'drizzle-orm';

import { SYNC_STATE_ID, syncState, type SyncDatabase, type SyncStateRow } from '@/db/schema';

const INITIAL_STATE: SyncStateRow = {
  id: SYNC_STATE_ID,
  workoutsCursor: null,
  backfillPage: 1,
  backfillDone: false,
  templatesSyncedAt: null,
  routinesSyncedAt: null,
  lastSyncAt: null,
  lastError: null,
};

export function readSyncState(db: SyncDatabase): SyncStateRow {
  return db.select().from(syncState).where(eq(syncState.id, SYNC_STATE_ID)).get() ?? INITIAL_STATE;
}

export function writeSyncState(db: SyncDatabase, patch: Partial<SyncStateRow>): void {
  db.insert(syncState)
    .values({ ...INITIAL_STATE, ...patch })
    .onConflictDoUpdate({ target: syncState.id, set: patch })
    .run();
}
