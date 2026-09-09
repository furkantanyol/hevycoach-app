import { MAX_PAGE_SIZE, type HevyClient } from '@furkantanyol/hevy-client';

import { applyWorkouts } from './apply';
import { readSyncState, writeSyncState } from './sync-state';

import type { SyncDatabase } from '@/db/schema';

/** Only the slice of the Hevy client this needs, so a test can stand in a small fake. */
export type BackfillClient = { workouts: Pick<HevyClient['workouts'], 'list'> };

export type BackfillProgress = {
  page: number;
  pageCount: number;
};

export type BackfillSummary = BackfillProgress & {
  workouts: number;
  done: boolean;
};

/**
 * Walks the whole workout history one page at a time, resuming from wherever the last run stopped.
 * Every page is applied and its position recorded before the next is fetched, so an interrupted
 * run costs at most one repeated page.
 */
export async function runBackfill(
  db: SyncDatabase,
  client: BackfillClient,
  onProgress?: (progress: BackfillProgress) => void
): Promise<BackfillSummary> {
  const state = readSyncState(db);

  if (state.backfillDone) {
    return { page: state.backfillPage, pageCount: state.backfillPage, workouts: 0, done: true };
  }

  // The delta watermark is taken before the first page, so a workout that changes mid-backfill is
  // caught by the delta pass even if the page it lived on was already read.
  if (state.workoutsCursor === null) {
    writeSyncState(db, { workoutsCursor: new Date().toISOString() });
  }

  let page = state.backfillPage;
  let workouts = 0;
  let pageCount = page;

  for (;;) {
    const result = await client.workouts.list({ page, pageSize: MAX_PAGE_SIZE });

    applyWorkouts(db, result.workouts);
    workouts += result.workouts.length;
    pageCount = result.page_count;

    const done = page >= result.page_count;

    writeSyncState(db, { backfillPage: done ? page : page + 1, backfillDone: done });
    onProgress?.({ page, pageCount });

    if (done) {
      return { page, pageCount, workouts, done };
    }

    page += 1;
  }
}
