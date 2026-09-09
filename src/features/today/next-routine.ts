import type { Routine, Workout } from '@furkantanyol/hevy-client';

export type NextSession = {
  readonly routine: Routine;
  /** The logged session this one follows, when Hevy recorded which routine was trained. */
  readonly after: Workout | null;
};

function newestRoutineWorkout(
  workouts: readonly Workout[],
  routineIds: ReadonlySet<string>
): Workout | null {
  return workouts.reduce<Workout | null>((newest, workout) => {
    if (workout.routine_id === null || !routineIds.has(workout.routine_id)) {
      return newest;
    }
    const isNewer = newest === null || Date.parse(workout.start_time) > Date.parse(newest.start_time);
    return isNewer ? workout : newest;
  }, null);
}

/**
 * The session to do now, until the rules engine exists to decide it properly.
 *
 * The only rule here is the user's own: the routine after the one they last trained, in the order
 * their routines sit in Hevy, wrapping at the end. Nothing about load, volume or readiness is
 * inferred — that is the rules engine's, and its spec has not landed.
 *
 * A history with no recognisable routine (a freestyle session, a routine since deleted, or a first
 * run) starts at the top of the list.
 */
export function pickNextRoutine(
  routines: readonly Routine[],
  workouts: readonly Workout[]
): NextSession | null {
  const first = routines.at(0);
  if (first === undefined) {
    return null;
  }

  const lastTrained = newestRoutineWorkout(workouts, new Set(routines.map((routine) => routine.id)));
  if (lastTrained === null) {
    return { routine: first, after: null };
  }

  const lastIndex = routines.findIndex((routine) => routine.id === lastTrained.routine_id);
  const next = routines[(lastIndex + 1) % routines.length];

  return { routine: next, after: lastTrained };
}
