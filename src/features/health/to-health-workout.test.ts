import type { Workout } from '@furkantanyol/hevy-client';

import { toHealthWorkout } from './to-health-workout';

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
    const healthWorkout = toHealthWorkout(buildWorkout());

    expect(healthWorkout).toEqual({
      id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
      title: 'Push A',
      startTime: '2026-09-08T07:00:00Z',
      endTime: '2026-09-08T08:05:00Z',
      version: 1788854760,
    });
  });

  it('should raise the version when the workout is edited later in Hevy', () => {
    const exported = toHealthWorkout(buildWorkout());
    const edited = toHealthWorkout(buildWorkout({ updated_at: '2026-09-08T09:30:00Z' }));

    expect(edited.version).toBeGreaterThan(exported.version);
  });
});
