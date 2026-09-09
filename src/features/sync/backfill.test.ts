import type { Workout } from '@furkantanyol/hevy-client';

import { runBackfill, type BackfillClient } from './backfill';
import { readSyncState } from './sync-state';
import { buildWorkout, createTestDatabase } from './test-support';

import { workouts } from '@/db/schema';

const PAGE_COUNT = 3;

function pagedClient(failOnPage?: number): BackfillClient {
  return {
    workouts: {
      list: (params) => {
        const page = params?.page ?? 1;

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

describe('runBackfill', () => {
  it('should take the delta watermark before reading the first page', async () => {
    const db = createTestDatabase();
    const before = new Date().toISOString();

    await runBackfill(db, pagedClient());

    const { workoutsCursor } = readSyncState(db);

    expect(workoutsCursor).not.toBeNull();
    expect(workoutsCursor?.localeCompare(before)).toBeGreaterThanOrEqual(0);
  });

  it('should walk every page and mark itself done', async () => {
    const db = createTestDatabase();

    const summary = await runBackfill(db, pagedClient());

    expect(summary).toEqual({ page: 3, pageCount: 3, workouts: 3, done: true });
    expect(readSyncState(db).backfillDone).toBe(true);
  });

  it('should resume where it stopped and store each workout exactly once', async () => {
    const db = createTestDatabase();

    await expect(runBackfill(db, pagedClient(PAGE_COUNT))).rejects.toThrow('connection reset');
    expect(readSyncState(db).backfillDone).toBe(false);

    await runBackfill(db, pagedClient());

    expect(db.select().from(workouts).all().map((workout) => workout.id).sort()).toEqual([
      'workout-1',
      'workout-2',
      'workout-3',
    ]);
    expect(readSyncState(db).backfillDone).toBe(true);
  });

  it('should not read any page once the backfill is done', async () => {
    const db = createTestDatabase();
    const list = jest.fn(pagedClient().workouts.list);

    await runBackfill(db, pagedClient());
    await runBackfill(db, { workouts: { list } });

    expect(list).not.toHaveBeenCalled();
  });

  it('should report the page it reached as it goes', async () => {
    const db = createTestDatabase();
    const pages: number[] = [];

    await runBackfill(db, pagedClient(), (progress) => pages.push(progress.page));

    expect(pages).toEqual([1, 2, 3]);
  });
});
