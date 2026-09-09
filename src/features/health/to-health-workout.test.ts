import type { Workout } from '@furkantanyol/hevy-client';

import { EXPORT_FORMAT_VERSION, toHealthWorkout } from './to-health-workout';

const UPDATED_AT_EPOCH_SECONDS = 1788854760;
const BODYWEIGHT_KG = 80;
/** 65 minutes with no RPE logged: the midpoint 4.75 METs at 80 kg. */
const ENERGY_KCAL = 412;

function buildWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
    title: 'Push A',
    routine_id: null,
    description: '',
    start_time: '2026-09-08T07:00:00Z',
    end_time: '2026-09-08T08:05:00Z',
    updated_at: '2026-09-08T08:06:00Z',
    created_at: '2026-09-08T08:06:00Z',
    exercises: [],
    ...overrides,
  };
}

describe('toHealthWorkout', () => {
  it('should map a Hevy workout onto the Apple Health shape', () => {
    const healthWorkout = toHealthWorkout(buildWorkout(), BODYWEIGHT_KG);

    expect(healthWorkout).toEqual({
      id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
      title: 'Push A',
      startTime: '2026-09-08T07:00:00Z',
      endTime: '2026-09-08T08:05:00Z',
      energyKcal: ENERGY_KCAL,
      version: UPDATED_AT_EPOCH_SECONDS + EXPORT_FORMAT_VERSION,
    });
  });

  it('should write no energy when Hevy holds no bodyweight', () => {
    const healthWorkout = toHealthWorkout(buildWorkout(), null);

    expect(healthWorkout.energyKcal).toBeNull();
  });

  it('should estimate more energy for a heavier lifter', () => {
    const healthWorkout = toHealthWorkout(buildWorkout(), 100);

    expect(healthWorkout.energyKcal).toBe(515);
  });

  it('should raise the version when the workout is edited later in Hevy', () => {
    const exported = toHealthWorkout(buildWorkout(), BODYWEIGHT_KG);
    const edited = toHealthWorkout(
      buildWorkout({ updated_at: '2026-09-08T09:30:00Z' }),
      BODYWEIGHT_KG,
    );

    expect(edited.version).toBeGreaterThan(exported.version);
  });
});
