import type { Workout, WorkoutSet } from '@furkantanyol/hevy-client';

/** Traditional strength training spans roughly 3.5 METs (light) to 6 METs (vigorous). */
export const MIN_MET = 3.5;
export const MAX_MET = 6;

/** Hevy logs RPE from 6 to 10, so those are the ends of the band the METs are mapped onto. */
export const MIN_RPE = 6;
export const MAX_RPE = 10;

/** Used when Hevy has no body measurement carrying a weight. */
export const DEFAULT_BODYWEIGHT_KG = 80;

const MIDPOINT_MET = (MIN_MET + MAX_MET) / 2;
const SECONDS_PER_HOUR = 3600;

/** Linear from `MIN_MET` at `MIN_RPE` to `MAX_MET` at `MAX_RPE`; unlogged effort takes the midpoint. */
export function metsForRpe(avgRpe: number | null): number {
  if (avgRpe === null) {
    return MIDPOINT_MET;
  }
  const clampedRpe = Math.min(Math.max(avgRpe, MIN_RPE), MAX_RPE);
  const position = (clampedRpe - MIN_RPE) / (MAX_RPE - MIN_RPE);
  return MIN_MET + position * (MAX_MET - MIN_MET);
}

/** Mean RPE of the working sets that carry one, or null when the workout logged no RPE at all. */
export function averageRpe(workout: Workout): number | null {
  const scores = workout.exercises.flatMap((exercise) => exercise.sets.flatMap(loggedRpe));
  if (scores.length === 0) {
    return null;
  }
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

type EnergyEstimateInput = {
  avgRpe: number | null;
  bodyweightKg: number;
  durationSeconds: number;
};

/** One MET is about one kcal per kilogram per hour, which is the whole of the estimate. */
export function estimateEnergyKcal({
  avgRpe,
  bodyweightKg,
  durationSeconds,
}: EnergyEstimateInput): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  const hours = durationSeconds / SECONDS_PER_HOUR;
  return Math.max(0, Math.round(metsForRpe(avgRpe) * bodyweightKg * hours));
}

/** Warmups are not the effort the RPE band describes, so they never move the average. */
function loggedRpe(set: WorkoutSet): number[] {
  if (set.type === 'warmup' || set.rpe === null) {
    return [];
  }
  return [set.rpe];
}
