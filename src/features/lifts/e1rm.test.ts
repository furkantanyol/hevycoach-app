import type { ExerciseHistoryEntry } from '@furkantanyol/hevy-client';

import { estimateOneRepMax, oneRepMaxTrend } from './e1rm';

type EntryOverrides = Partial<ExerciseHistoryEntry> &
  Pick<ExerciseHistoryEntry, 'workout_id' | 'workout_start_time'>;

function buildEntry(overrides: EntryOverrides): ExerciseHistoryEntry {
  return {
    workout_title: 'Push A',
    workout_end_time: overrides.workout_start_time,
    exercise_template_id: '05293BCA',
    weight_kg: 100,
    reps: 5,
    distance_meters: null,
    duration_seconds: null,
    rpe: null,
    custom_metric: null,
    set_type: 'normal',
    ...overrides,
  };
}

describe('estimateOneRepMax', () => {
  it('should apply the Epley formula to a multi-rep set', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
  });

  it('should report a single as the weight lifted, because a max is not estimated from itself', () => {
    expect(estimateOneRepMax(140, 1)).toBe(140);
  });

  it('should refuse a set with no load, so bodyweight and timed work never plot as zero', () => {
    expect(estimateOneRepMax(null, 12)).toBeNull();
  });

  it('should refuse a set with no reps', () => {
    expect(estimateOneRepMax(100, null)).toBeNull();
  });

  it('should refuse a zero load rather than returning zero', () => {
    expect(estimateOneRepMax(0, 10)).toBeNull();
  });
});

describe('oneRepMaxTrend', () => {
  it('should return no points when nothing has been logged', () => {
    expect(oneRepMaxTrend([])).toEqual([]);
  });

  it('should order sessions oldest first so the trend reads left to right', () => {
    const trend = oneRepMaxTrend([
      buildEntry({ workout_id: 'newer', workout_start_time: '2026-09-08T07:00:00Z' }),
      buildEntry({ workout_id: 'older', workout_start_time: '2026-09-01T07:00:00Z' }),
    ]);

    expect(trend.map((point) => point.workoutId)).toEqual(['older', 'newer']);
  });

  it('should take the best working set of a session', () => {
    const trend = oneRepMaxTrend([
      buildEntry({ workout_id: 'w1', workout_start_time: '2026-09-08T07:00:00Z', reps: 5 }),
      buildEntry({
        workout_id: 'w1',
        workout_start_time: '2026-09-08T07:00:00Z',
        weight_kg: 110,
        reps: 5,
      }),
    ]);

    expect(trend).toHaveLength(1);
    expect(trend[0].estimateKg).toBeCloseTo(128.333, 2);
  });

  it('should ignore warmup sets, which are not the session the number is about', () => {
    const trend = oneRepMaxTrend([
      buildEntry({
        workout_id: 'w1',
        workout_start_time: '2026-09-08T07:00:00Z',
        weight_kg: 200,
        reps: 20,
        set_type: 'warmup',
      }),
      buildEntry({ workout_id: 'w1', workout_start_time: '2026-09-08T07:00:00Z' }),
    ]);

    expect(trend[0].estimateKg).toBeCloseTo(116.667, 3);
  });

  it('should drop a session where nothing could be estimated', () => {
    const trend = oneRepMaxTrend([
      buildEntry({
        workout_id: 'timed',
        workout_start_time: '2026-09-08T07:00:00Z',
        weight_kg: null,
        reps: null,
        duration_seconds: 60,
      }),
      buildEntry({ workout_id: 'loaded', workout_start_time: '2026-09-01T07:00:00Z' }),
    ]);

    expect(trend.map((point) => point.workoutId)).toEqual(['loaded']);
  });
});
