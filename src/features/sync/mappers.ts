import type {
  ExerciseTemplate,
  Routine,
  UpdateRoutineInput,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@furkantanyol/hevy-client';

import type {
  ExerciseTemplateRow,
  RoutineRow,
  SetRow,
  WorkoutExerciseRow,
  WorkoutRow,
} from '@/db/schema';

export type WorkoutRows = {
  workout: WorkoutRow;
  exercises: WorkoutExerciseRow[];
  sets: SetRow[];
};

/** Hevy identifies an exercise only by its position in the workout. */
function workoutExerciseId(workoutId: string, index: number): string {
  return `${workoutId}:${index}`;
}

function toWorkoutExerciseRow(workoutId: string, exercise: WorkoutExercise): WorkoutExerciseRow {
  return {
    id: workoutExerciseId(workoutId, exercise.index),
    workoutId,
    index: exercise.index,
    title: exercise.title,
    exerciseTemplateId: exercise.exercise_template_id,
    supersetId: exercise.superset_id,
    notes: exercise.notes,
  };
}

function toSetRow(exerciseId: string, set: WorkoutSet): SetRow {
  return {
    id: `${exerciseId}:${set.index}`,
    workoutExerciseId: exerciseId,
    index: set.index,
    type: set.type,
    weightKg: set.weight_kg,
    reps: set.reps,
    distanceMeters: set.distance_meters,
    durationSeconds: set.duration_seconds,
    rpe: set.rpe,
    customMetric: set.custom_metric,
  };
}

export function toWorkoutRows(workout: Workout): WorkoutRows {
  return {
    workout: {
      id: workout.id,
      title: workout.title,
      description: workout.description,
      routineId: workout.routine_id,
      startTime: new Date(workout.start_time),
      endTime: new Date(workout.end_time),
      createdAt: new Date(workout.created_at),
      updatedAt: new Date(workout.updated_at),
    },
    exercises: workout.exercises.map((exercise) => toWorkoutExerciseRow(workout.id, exercise)),
    sets: workout.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => toSetRow(workoutExerciseId(workout.id, exercise.index), set))
    ),
  };
}

export function toTemplateRow(template: ExerciseTemplate): ExerciseTemplateRow {
  return {
    id: template.id,
    title: template.title,
    type: template.type,
    primaryMuscleGroup: template.primary_muscle_group,
    secondaryMuscleGroups: template.secondary_muscle_groups,
    equipment: template.equipment,
    isCustom: template.is_custom,
  };
}

export function toRoutineRow(routine: Routine): RoutineRow {
  return {
    id: routine.id,
    title: routine.title,
    folderId: routine.folder_id,
    exercises: routine.exercises,
    createdAt: new Date(routine.created_at),
    updatedAt: new Date(routine.updated_at),
  };
}

/**
 * The update body is a different shape from the routine Hevy returns: it drops `index`, `title` and
 * per-set `rpe`, so the fields are copied across explicitly rather than passed through.
 *
 * Hevy's read model has no routine-level `notes` even though the update body accepts one, so a
 * rename cannot round-trip a note and this replacement may clear it. Stated, not solved.
 */
export function toRoutineUpdateInput(routine: RoutineRow): UpdateRoutineInput {
  return {
    title: routine.title,
    folder_id: routine.folderId,
    exercises: routine.exercises.map((exercise) => ({
      exercise_template_id: exercise.exercise_template_id,
      superset_id: exercise.superset_id,
      rest_seconds: exercise.rest_seconds,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        type: set.type,
        weight_kg: set.weight_kg,
        reps: set.reps,
        rep_range: set.rep_range,
        distance_meters: set.distance_meters,
        duration_seconds: set.duration_seconds,
        custom_metric: set.custom_metric,
      })),
    })),
  };
}
