import type { Workout } from '@furkantanyol/hevy-client';

import { averageRpe, estimateEnergyKcal } from './estimate-energy';

import type { HealthWorkout } from '@/modules/health-export';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Bumping this replaces every already-exported workout in Apple Health: it lifts the sync version
 * of workouts Hevy has not touched above the version stored by the previous export, which is the
 * only thing that makes HealthKit replace them. Bump it whenever what we write to Health changes.
 */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * Apple Health replaces a stored workout when it is saved again with a higher sync version, so the
 * version is the Hevy `updated_at` in epoch seconds: editing a workout in Hevy re-exports it,
 * re-exporting an untouched one is a no-op.
 */
export function toHealthWorkout(
  workout: Workout,
  bodyweightKg: number | null,
): HealthWorkout {
  const updatedAtEpochSeconds = Math.floor(
    Date.parse(workout.updated_at) / MILLISECONDS_PER_SECOND,
  );

  return {
    id: workout.id,
    title: workout.title,
    startTime: workout.start_time,
    endTime: workout.end_time,
    energyKcal: estimateEnergyKcal({
      avgRpe: averageRpe(workout),
      bodyweightKg,
      durationSeconds: durationSeconds(workout),
    }),
    version: updatedAtEpochSeconds + EXPORT_FORMAT_VERSION,
  };
}

function durationSeconds(workout: Workout): number {
  return (Date.parse(workout.end_time) - Date.parse(workout.start_time)) / MILLISECONDS_PER_SECOND;
}
