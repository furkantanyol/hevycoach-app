import { applyDeletes, applyWorkouts } from './apply';
import { buildWorkout, createTestDatabase } from './test-support';

import { sets, workoutExercises, workouts, type SyncDatabase } from '@/db/schema';

function countRows(db: SyncDatabase) {
  return {
    workouts: db.select().from(workouts).all().length,
    exercises: db.select().from(workoutExercises).all().length,
    sets: db.select().from(sets).all().length,
  };
}

describe('applyWorkouts', () => {
  it('should leave the same rows behind when the same workout is applied twice', () => {
    const db = createTestDatabase();

    applyWorkouts(db, [buildWorkout()]);
    applyWorkouts(db, [buildWorkout()]);

    expect(countRows(db)).toEqual({ workouts: 1, exercises: 1, sets: 2 });
  });

  it('should update a workout in place when it changed in Hevy', () => {
    const db = createTestDatabase();

    applyWorkouts(db, [buildWorkout()]);
    applyWorkouts(db, [buildWorkout({ title: 'Push A (edited)' })]);

    expect(db.select().from(workouts).all()[0].title).toBe('Push A (edited)');
  });

  it('should not keep orphan sets when a workout comes back with fewer of them', () => {
    const db = createTestDatabase();
    const trimmed = buildWorkout();

    applyWorkouts(db, [buildWorkout()]);
    trimmed.exercises[0].sets = trimmed.exercises[0].sets.slice(0, 1);
    applyWorkouts(db, [trimmed]);

    expect(db.select().from(sets).all().map((set) => set.id)).toEqual(['workout-1:0:0']);
  });
});

describe('applyDeletes', () => {
  it('should take the exercises and sets down with the workout', () => {
    const db = createTestDatabase();

    applyWorkouts(db, [buildWorkout()]);
    applyDeletes(db, ['workout-1']);

    expect(countRows(db)).toEqual({ workouts: 0, exercises: 0, sets: 0 });
  });

  it('should leave other workouts alone', () => {
    const db = createTestDatabase();

    applyWorkouts(db, [buildWorkout(), buildWorkout({ id: 'workout-2' })]);
    applyDeletes(db, ['workout-1']);

    expect(db.select().from(workouts).all().map((workout) => workout.id)).toEqual(['workout-2']);
  });
});
