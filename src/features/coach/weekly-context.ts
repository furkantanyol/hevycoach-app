import type { Workout } from '@furkantanyol/hevy-client';

export const CONTEXT_WINDOW_DAYS = 7;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const WARMUP = 'warmup';

function countWorkingSets(workout: Workout): number {
  return workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.type !== WARMUP).length,
    0
  );
}

function newest(workouts: readonly Workout[]): Workout | undefined {
  return workouts.reduce<Workout | undefined>(
    (latest, workout) =>
      latest === undefined || Date.parse(workout.start_time) > Date.parse(latest.start_time)
        ? workout
        : latest,
    undefined
  );
}

/**
 * A one-line summary of recent training — never a hardcoded string. This is the round trip Gate B2
 * checks: the user's own data goes up, coaching comes back.
 *
 * Pure over the workouts it is handed so it stays testable; fetching them is `useRecentWorkouts`.
 * The most recent workout is reported even when it falls outside the window, so a quiet week reads
 * as a quiet week rather than as an empty history.
 */
export function buildWeeklyContext(workouts: readonly Workout[], now: Date = new Date()): string {
  const since = now.getTime() - CONTEXT_WINDOW_DAYS * MILLISECONDS_PER_DAY;
  const inWindow = workouts.filter((workout) => Date.parse(workout.start_time) >= since);
  const workingSets = inWindow.reduce((total, workout) => total + countWorkingSets(workout), 0);

  const latest = newest(workouts);
  const latestSummary = latest
    ? `most recent workout "${latest.title}" on ${new Date(latest.start_time).toISOString()}`
    : 'no workouts logged yet';

  return `${inWindow.length} sessions and ${workingSets} working sets in the last ${CONTEXT_WINDOW_DAYS} days; ${latestSummary}.`;
}
