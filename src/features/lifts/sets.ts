/**
 * Which logged sets count as training. Hevy names the field `type` on a workout's sets and
 * `set_type` on an exercise-history entry, so the same question is asked twice — but only once
 * decided, here, so no screen invents its own idea of what a working set is.
 */
const WARMUP = 'warmup';

type WorkoutSet = { readonly type: string };
type HistorySet = { readonly set_type: string };

export function isWorkingSet(set: WorkoutSet): boolean {
  return set.type !== WARMUP;
}

export function isWorkingEntry(entry: HistorySet): boolean {
  return entry.set_type !== WARMUP;
}

/** Working sets across a session's exercises. Warmups are not the stimulus the number is about. */
export function countWorkingSets(
  exercises: readonly { readonly sets: readonly WorkoutSet[] }[]
): number {
  return exercises.reduce(
    (total, exercise) => total + exercise.sets.filter(isWorkingSet).length,
    0
  );
}
