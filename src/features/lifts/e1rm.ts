import type { ExerciseHistoryEntry } from '@furkantanyol/hevy-client';

import { toSessions } from './history';

/**
 * Epley's constant. `1RM = w × (1 + r / 30)` is the form used by the sibling MCP server, so both
 * products put the same number on the same set.
 */
const EPLEY_DIVISOR = 30;

/** A single is the max that was lifted, so it is reported as itself rather than inflated by 1/30. */
const SINGLE = 1;

/**
 * An ESTIMATE of a one-rep max from a set that was actually performed, by the Epley formula.
 *
 * It is not a prescription and it is not a measured max — the label on screen says so. Sets with no
 * load or no reps (time, distance, bodyweight) cannot be estimated at all, and return null rather
 * than a zero that would sit on a chart looking like a collapse in strength.
 */
export function estimateOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (weightKg === null || reps === null || weightKg <= 0 || reps <= 0) {
    return null;
  }
  if (reps === SINGLE) {
    return weightKg;
  }
  return weightKg * (1 + reps / EPLEY_DIVISOR);
}

export type SessionEstimate = {
  readonly workoutId: string;
  readonly startTime: string;
  /** The best estimate of any working set in that session. */
  readonly estimateKg: number;
};

const WARMUP = 'warmup';

function bestEstimate(sets: readonly ExerciseHistoryEntry[]): number | null {
  return sets
    .filter((set) => set.set_type !== WARMUP)
    .reduce<number | null>((best, set) => {
      const estimate = estimateOneRepMax(set.weight_kg, set.reps);
      if (estimate === null) {
        return best;
      }
      return best === null || estimate > best ? estimate : best;
    }, null);
}

/**
 * One point per logged session, oldest first, so a chart reads left to right. Sessions where
 * nothing could be estimated are dropped rather than plotted at zero.
 */
export function oneRepMaxTrend(entries: readonly ExerciseHistoryEntry[]): SessionEstimate[] {
  return toSessions(entries)
    .map((session) => ({
      workoutId: session.workoutId,
      startTime: session.startTime,
      estimateKg: bestEstimate(session.sets),
    }))
    .filter((point): point is SessionEstimate => point.estimateKg !== null)
    .reverse();
}
