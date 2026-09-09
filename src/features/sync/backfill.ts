import { MAX_PAGE_SIZE, type HevyClient } from '@furkantanyol/hevy-client';

import { applyWorkouts } from './apply';
import { readSyncState, writeSyncState } from './sync-state';

import type { SyncDatabase } from '@/db/schema';

/** Only the slice of the Hevy client this needs, so a test can stand in a small fake. */
export type BackfillClient = { workouts: Pick<HevyClient['workouts'], 'list'> };

export type BackfillSummary = {
  /** The last page read. */
  page: number;
  workouts: number;
  done: boolean;
};

/**
 * The watermark comes off the device clock, which can run ahead of Hevy's. Anything Hevy stamps
 * inside that gap would sort before the cursor and never be delivered, so the cursor is backdated.
 * Re-delivery is idempotent, so the margin costs nothing but a few repeated upserts.
 */
const CLOCK_SKEW_MARGIN_MS = 5 * 60 * 1_000;

/**
 * Walks the whole workout history one page at a time, resuming from wherever the last run stopped.
 * Every page is applied and its position recorded before the next is fetched, so an interrupted
 * run costs at most one repeated page.
 */
export async function runBackfill(db: SyncDatabase, client: BackfillClient): Promise<BackfillSummary> {
  const state = readSyncState(db);

  if (state.backfillDone) {
    return { page: state.backfillPage, workouts: 0, done: true };
  }

  // The delta watermark is taken before the first page, so a workout that changes mid-backfill is
  // caught by the delta pass even if the page it lived on was already read.
  if (state.workoutsCursor === null) {
    const watermark = new Date(Date.now() - CLOCK_SKEW_MARGIN_MS);

    writeSyncState(db, { workoutsCursor: watermark.toISOString() });
  }

  let page = state.backfillPage;
  let workouts = 0;

  for (;;) {
    const result = await client.workouts.list({ page, pageSize: MAX_PAGE_SIZE });

    applyWorkouts(db, result.workouts);
    workouts += result.workouts.length;

    const done = page >= result.page_count;

    writeSyncState(db, { backfillPage: done ? page : page + 1, backfillDone: done });

    if (done) {
      return { page, workouts, done };
    }

    page += 1;
  }
}
