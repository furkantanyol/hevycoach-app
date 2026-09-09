import type { Routine, Workout } from '@furkantanyol/hevy-client';

import { formatDate } from './format';

export type LiftNote = {
  /** Where the user wrote it, so a standing form cue reads differently from a note about one day. */
  readonly source: string;
  readonly text: string;
};

type ExerciseOf = {
  readonly exercise_template_id: string;
  readonly title: string;
  readonly notes: string;
};

function notesFrom(exercises: readonly ExerciseOf[], templateId: string, source: string): LiftNote[] {
  return exercises
    .filter((exercise) => exercise.exercise_template_id === templateId)
    .map((exercise) => ({ source, text: exercise.notes.trim() }))
    .filter((note) => note.text.length > 0);
}

/**
 * The user's own notes on one exercise, as Hevy holds them: the standing note on a routine, and
 * whatever they wrote against it in a session. Nothing is generated here.
 */
export function collectNotes(
  templateId: string,
  routines: readonly Routine[],
  workouts: readonly Workout[]
): LiftNote[] {
  const fromRoutines = routines.flatMap((routine) =>
    notesFrom(routine.exercises, templateId, `Routine · ${routine.title}`)
  );
  const fromWorkouts = [...workouts]
    .sort((left, right) => Date.parse(right.start_time) - Date.parse(left.start_time))
    .flatMap((workout) =>
      notesFrom(workout.exercises, templateId, `Logged ${formatDate(workout.start_time)}`)
    );

  const seen = new Set<string>();
  return [...fromRoutines, ...fromWorkouts].filter((note) => {
    if (seen.has(note.text)) {
      return false;
    }
    seen.add(note.text);
    return true;
  });
}

/** The exercise's own name, which exercise history does not carry but routines and workouts do. */
export function findExerciseTitle(
  templateId: string,
  routines: readonly Routine[],
  workouts: readonly Workout[]
): string | undefined {
  const exercises = [
    ...routines.flatMap((routine) => routine.exercises),
    ...workouts.flatMap((workout) => workout.exercises),
  ];

  return exercises.find((exercise) => exercise.exercise_template_id === templateId)?.title;
}
