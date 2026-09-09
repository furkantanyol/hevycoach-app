import { runDelta, type DeltaClient } from './delta';
import { readSyncState, writeSyncState } from './sync-state';
import { buildWorkout, createTestDatabase } from './test-support';

import { sets, workoutExercises, workouts } from '@/db/schema';

function clientReturning(changes: Awaited<ReturnType<DeltaClient['workouts']['changes']>>) {
  return { workouts: { changes: () => Promise.resolve(changes) } };
}

const CURSOR = '2026-09-09T09:00:00Z';

describe('runDelta', () => {
  it('should apply upserts and tombstones from the same page', async () => {
    const db = createTestDatabase();
    const client = clientReturning({
      upserts: [buildWorkout({ id: 'kept' })],
      deletes: [{ type: 'deleted', id: 'gone', deleted_at: CURSOR }],
      cursor: CURSOR,
    });

    await runDelta(db, client);

    expect(db.select().from(workouts).all().map((workout) => workout.id)).toEqual(['kept']);
  });

  it('should remove the children of a deleted workout', async () => {
    const db = createTestDatabase();

    await runDelta(db, clientReturning({ upserts: [buildWorkout()], deletes: [], cursor: CURSOR }));
    await runDelta(
      db,
      clientReturning({
        upserts: [],
        deletes: [{ type: 'deleted', id: 'workout-1', deleted_at: CURSOR }],
        cursor: '2026-09-09T10:00:00Z',
      })
    );

    expect(db.select().from(workoutExercises).all()).toEqual([]);
    expect(db.select().from(sets).all()).toEqual([]);
  });

  it('should advance the cursor once the rows are committed', async () => {
    const db = createTestDatabase();

    await runDelta(db, clientReturning({ upserts: [buildWorkout()], deletes: [], cursor: CURSOR }));

    expect(readSyncState(db).workoutsCursor).toBe(CURSOR);
  });

  it('should keep the old cursor when applying the batch throws', async () => {
    const db = createTestDatabase();
    const previous = '2026-09-01T00:00:00Z';

    writeSyncState(db, { workoutsCursor: previous });

    // Two exercises at the same index collide on the primary key, so the transaction rolls back.
    const broken = buildWorkout();
    broken.exercises = [broken.exercises[0], { ...broken.exercises[0] }];

    await expect(
      runDelta(db, clientReturning({ upserts: [broken], deletes: [], cursor: CURSOR }))
    ).rejects.toThrow();

    expect(readSyncState(db).workoutsCursor).toBe(previous);
    expect(db.select().from(workouts).all()).toEqual([]);
  });
});
