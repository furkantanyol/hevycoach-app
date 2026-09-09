import type { ExerciseHistoryEntry } from '@furkantanyol/hevy-client';

export type LoggedSession = {
  readonly workoutId: string;
  readonly title: string;
  readonly startTime: string;
  readonly sets: ExerciseHistoryEntry[];
};

/**
 * Hevy returns exercise history flat, one entry per set. Sessions are its natural grouping, and
 * every screen that shows history shows it by session.
 *
 * Newest session first, because that is the one the user is comparing against at the rack.
 */
export function toSessions(entries: readonly ExerciseHistoryEntry[]): LoggedSession[] {
  const byWorkout = new Map<string, LoggedSession>();

  for (const entry of entries) {
    const session = byWorkout.get(entry.workout_id);
    if (session) {
      session.sets.push(entry);
    } else {
      byWorkout.set(entry.workout_id, {
        workoutId: entry.workout_id,
        title: entry.workout_title,
        startTime: entry.workout_start_time,
        sets: [entry],
      });
    }
  }

  return [...byWorkout.values()].sort(
    (left, right) => Date.parse(right.startTime) - Date.parse(left.startTime)
  );
}
