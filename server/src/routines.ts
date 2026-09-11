/**
 * The routines an athlete already runs, for a block that continues them: read off the routines
 * their recent workouts were logged from, and written the way the plan prompt reads them.
 */
import { HevyApiError, type HevyClient, type Routine, type RoutineExercise, type RoutineSet, type Workout } from 'hevy-sdk';
import { WARMUP_SET } from './hevy.js';

/** The routines behind the block they were running: at most this many, newest workout first. */
const CURRENT_ROUTINES = 6;

/**
 * The distinct routines the recent workouts were logged from, newest first. One deleted since is
 * skipped — there is nothing left to continue — while any other failure fails the plan, as every
 * other Hevy read in it does.
 */
export async function currentRoutines(client: HevyClient, recent: Workout[]): Promise<Routine[]> {
  const ids = recent.map((workout) => workout.routine_id).filter((id): id is string => id !== null);
  const routines: Routine[] = [];
  for (const id of [...new Set(ids)].slice(0, CURRENT_ROUTINES)) {
    try {
      routines.push(await client.routines.get(id));
    } catch (error) {
      if (error instanceof HevyApiError && error.isNotFound) continue;
      throw error;
    }
  }
  return routines;
}

const routineSet = (set: RoutineSet): string => `${set.reps ?? '?'}x${set.weight_kg ?? 0}kg`;

function routineExerciseLine(exercise: RoutineExercise): string {
  const working = (exercise.sets ?? []).filter((set) => set.type !== WARMUP_SET);
  return `- ${exercise.title} [${exercise.exercise_template_id}]: ${working.map(routineSet).join(', ')}`;
}

/** What they run now, for a block that continues it: every routine with its working sets as reps x kg. */
export function formatRoutines(routines: Routine[]): string {
  return routines
    .map((routine) => [`${routine.title} [${routine.id}]`, ...(routine.exercises ?? []).map(routineExerciseLine)].join('\n'))
    .join('\n\n');
}
