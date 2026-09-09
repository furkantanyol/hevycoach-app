import type { Workout } from '@furkantanyol/hevy-client';

import type { HealthWorkout } from '@/modules/health-export';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Apple Health replaces a stored workout when it is saved again with a higher sync version, so the
 * version is the Hevy `updated_at` in epoch seconds: editing a workout in Hevy re-exports it,
 * re-exporting an untouched one is a no-op.
 */
export function toHealthWorkout(workout: Workout): HealthWorkout {
  return {
    id: workout.id,
    title: workout.title,
    startTime: workout.start_time,
    endTime: workout.end_time,
    version: Math.floor(Date.parse(workout.updated_at) / MILLISECONDS_PER_SECOND),
  };
}
