import type { Workout } from '@furkantanyol/hevy-client';

import { CLOCK_SKEW_MARGIN_MS, runBackfill, type BackfillClient } from './backfill';
import { readSyncState } from './sync-state';
import { buildWorkout, createTestDatabase } from './test-support';

import { workouts, type SyncDatabase } from '@/db/schema';

const PAGE_COUNT = 3;

type PagedClient = BackfillClient & { pagesRead: number[] };

function pagedClient(failOnPage?: number): PagedClient {
  const pagesRead: number[] = [];

  return {
    pagesRead,
    workouts: {
      list: (params) => {
        const page = params?.page ?? 1;

        pagesRead.push(page);

        if (page === failOnPage) {
          return Promise.reject(new Error('connection reset'));
        }

        return Promise.resolve({
          page,
          page_count: PAGE_COUNT,
          workouts: [buildWorkout({ id: `workout-${page}` })] satisfies Workout[],
        });
      },
    },
  };
}

function storedWorkoutIds(db: SyncDatabase): string[] {
  return db
    .select()
    .from(workouts)
    .all()
    .map((workout) => workout.id)
    .sort();
}

describe('runBackfill', () => {
  it('should have the delta watermark in place before it reads the first page', async () => {
    const db = createTestDatabase();
    const cursorsWhenPageRead: (string | null)[] = [];
    const client = pagedClient();
    const { list } = client.workouts;

    client.workouts.list = (params) => {
      cursorsWhenPageRead.push(readSyncState(db).workoutsCursor);

      return list(params);
    };
    await runBackfill(db, client);

    expect(cursorsWhenPageRead[0]).not.toBeNull();
  });

  it('should backdate the watermark, so a fast server clock cannot hide events', async () => {
    const db = createTestDatabase();

    await runBackfill(db, pagedClient());

    const { workoutsCursor } = readSyncState(db);

    expect(workoutsCursor).not.toBeNull();
    expect(Date.now() - Date.parse(workoutsCursor ?? '')).toBeGreaterThanOrEqual(
      CLOCK_SKEW_MARGIN_MS
    );
  });

  it('should walk every page and mark itself done', async () => {
    const db = createTestDatabase();

    const summary = await runBackfill(db, pagedClient());

    expect(summary).toEqual({ page: 3, workouts: 3, done: true });
    expect(readSyncState(db).backfillDone).toBe(true);
  });

  it('should resume at the page it failed on rather than starting over', async () => {
    const db = createTestDatabase();
    const resumed = pagedClient();

    await expect(runBackfill(db, pagedClient(PAGE_COUNT))).rejects.toThrow('connection reset');
    expect(readSyncState(db).backfillDone).toBe(false);

    const summary = await runBackfill(db, resumed);

    expect(resumed.pagesRead).toEqual([3]);
    expect(summary.workouts).toBe(1);
    expect(storedWorkoutIds(db)).toEqual(['workout-1', 'workout-2', 'workout-3']);
    expect(readSyncState(db).backfillDone).toBe(true);
  });

  it('should not read any page once the backfill is done', async () => {
    const db = createTestDatabase();
    const second = pagedClient();

    await runBackfill(db, pagedClient());
    await runBackfill(db, second);

    expect(second.pagesRead).toEqual([]);
  });
});
