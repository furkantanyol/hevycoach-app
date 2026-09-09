import type { Workout } from '@furkantanyol/hevy-client';
import { eq, inArray } from 'drizzle-orm';

import { toWorkoutRows } from './mappers';

import { sets, workoutExercises, workouts, type SyncDatabase } from '@/db/schema';

/**
 * Upserts a batch of workouts in one transaction. Children are replaced rather than merged, so a
 * workout that lost a set in Hevy does not keep an orphan here. Safe to call twice with the same
 * batch, which is what makes cursor re-delivery harmless.
 */
export function applyWorkouts(db: SyncDatabase, incoming: Workout[]): void {
  if (incoming.length === 0) {
    return;
  }

  const batch = incoming.map(toWorkoutRows);

  db.transaction((tx) => {
    for (const rows of batch) {
      tx.insert(workouts)
        .values(rows.workout)
        .onConflictDoUpdate({ target: workouts.id, set: rows.workout })
        .run();

      // Deleting the exercises cascades to their sets.
      tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, rows.workout.id)).run();

      if (rows.exercises.length > 0) {
        tx.insert(workoutExercises).values(rows.exercises).run();
      }
      if (rows.sets.length > 0) {
        tx.insert(sets).values(rows.sets).run();
      }
    }
  });
}

/** Deletes workouts by id. Exercises and sets go with them through the foreign keys. */
export function applyDeletes(db: SyncDatabase, ids: string[]): void {
  if (ids.length === 0) {
    return;
  }

  db.delete(workouts).where(inArray(workouts.id, ids)).run();
}
