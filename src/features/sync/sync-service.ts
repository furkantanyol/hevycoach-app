import { HevyNetworkError, type HevyClient } from '@furkantanyol/hevy-client';

import { runBackfill } from './backfill';
import { runDelta } from './delta';
import { toRoutineRow, toTemplateRow } from './mappers';
import { drainOutbox } from './outbox';
import { readSyncState, writeSyncState } from './sync-state';

import { exerciseTemplates, routines, type SyncDatabase } from '@/db/schema';

const TEMPLATES_TTL_MS = 24 * 60 * 60 * 1_000;

export type SyncSummary = {
  status: 'synced' | 'offline';
  sent: number;
  workoutsUpserted: number;
  workoutsDeleted: number;
  backfillDone: boolean;
};

/** The exercise library barely moves, so it is refreshed once a day rather than every sync. */
async function refreshTemplatesIfStale(db: SyncDatabase, client: HevyClient): Promise<void> {
  const { templatesSyncedAt } = readSyncState(db);

  if (templatesSyncedAt && Date.now() - templatesSyncedAt.getTime() < TEMPLATES_TTL_MS) {
    return;
  }

  const templates = await client.exerciseTemplates.listAll();

  db.transaction((tx) => {
    for (const template of templates) {
      const row = toTemplateRow(template);

      tx.insert(exerciseTemplates)
        .values(row)
        .onConflictDoUpdate({ target: exerciseTemplates.id, set: row })
        .run();
    }
  });

  writeSyncState(db, { templatesSyncedAt: new Date() });
}

/**
 * Routines have no events endpoint, so a deleted routine is only visible by replacing the lot.
 * Skipped while the outbox still holds a routine write, which the server copy would overwrite.
 */
async function refreshRoutines(
  db: SyncDatabase,
  client: HevyClient,
  pendingWrites: number
): Promise<void> {
  if (pendingWrites > 0) {
    return;
  }

  const rows = (await client.routines.listAll()).map(toRoutineRow);

  db.transaction((tx) => {
    tx.delete(routines).run();

    if (rows.length > 0) {
      tx.insert(routines).values(rows).run();
    }
  });

  writeSyncState(db, { routinesSyncedAt: new Date() });
}

/**
 * One pass: push local writes, then pull. Writes go first so a routine the user just edited is not
 * immediately overwritten by the server's copy of it.
 */
export async function runSync(db: SyncDatabase, client: HevyClient): Promise<SyncSummary> {
  const summary: SyncSummary = {
    status: 'synced',
    sent: 0,
    workoutsUpserted: 0,
    workoutsDeleted: 0,
    backfillDone: readSyncState(db).backfillDone,
  };

  try {
    const drained = await drainOutbox(db, client);

    summary.sent = drained.sent;

    await refreshTemplatesIfStale(db, client);
    await refreshRoutines(db, client, drained.pending);

    summary.backfillDone = (await runBackfill(db, client)).done;

    const delta = await runDelta(db, client);

    summary.workoutsUpserted = delta.upserted;
    summary.workoutsDeleted = delta.deleted;

    writeSyncState(db, { lastSyncAt: new Date(), lastError: null });

    return summary;
  } catch (caught) {
    // Offline is an expected state, not a failure: nothing was lost, the cursors did not move and
    // the outbox still holds every write.
    if (caught instanceof HevyNetworkError) {
      summary.status = 'offline';

      return summary;
    }

    writeSyncState(db, { lastError: caught instanceof Error ? caught.message : String(caught) });

    throw caught;
  }
}
