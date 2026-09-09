import type { Workout, WorkoutSet } from '@furkantanyol/hevy-client';

import {
  averageRpe,
  DEFAULT_BODYWEIGHT_KG,
  estimateEnergyKcal,
  metsForRpe,
  MAX_MET,
  MIN_MET,
} from './estimate-energy';

const MIDPOINT_MET = 4.75;
const ONE_HOUR_IN_SECONDS = 3600;

function buildSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    index: 0,
    type: 'normal',
    weight_kg: 100,
    reps: 8,
    distance_meters: null,
    duration_seconds: null,
    rpe: null,
    custom_metric: null,
    ...overrides,
  };
}

function buildWorkout(sets: WorkoutSet[]): Workout {
  return {
    id: 'b459cba5-cd6d-463c-abd6-54f8eafcadcb',
    title: 'Push A',
    routine_id: null,
    description: '',
    start_time: '2026-09-08T07:00:00Z',
    end_time: '2026-09-08T08:00:00Z',
    updated_at: '2026-09-08T08:06:00Z',
    created_at: '2026-09-08T08:06:00Z',
    exercises: [
      {
        index: 0,
        title: 'Bench Press (Barbell)',
        notes: '',
        exercise_template_id: '79D0BB3A',
        superset_id: null,
        sets,
      },
    ],
  };
}

describe('metsForRpe', () => {
  it('should return the lowest MET when the average RPE is at the bottom of the band', () => {
    expect(metsForRpe(6)).toBe(MIN_MET);
  });

  it('should return the highest MET when the average RPE is at the top of the band', () => {
    expect(metsForRpe(10)).toBe(MAX_MET);
  });

  it('should return the midpoint MET when the average RPE is halfway up the band', () => {
    expect(metsForRpe(8)).toBe(MIDPOINT_MET);
  });

  it('should return the midpoint MET when no RPE was logged', () => {
    expect(metsForRpe(null)).toBe(MIDPOINT_MET);
  });

  it('should clamp to the highest MET when the average RPE is above the band', () => {
    expect(metsForRpe(12)).toBe(MAX_MET);
  });

  it('should clamp to the lowest MET when the average RPE is below the band', () => {
    expect(metsForRpe(2)).toBe(MIN_MET);
  });
});

describe('estimateEnergyKcal', () => {
  it('should multiply METs by bodyweight and hours', () => {
    const kcal = estimateEnergyKcal({
      avgRpe: 8,
      bodyweightKg: 80,
      durationSeconds: ONE_HOUR_IN_SECONDS,
    });

    expect(kcal).toBe(380);
  });

  it('should scale with bodyweight', () => {
    const kcal = estimateEnergyKcal({
      avgRpe: 8,
      bodyweightKg: 100,
      durationSeconds: ONE_HOUR_IN_SECONDS,
    });

    expect(kcal).toBe(475);
  });

  it('should fall back to 80 kg worth of energy when the default bodyweight is used', () => {
    const kcal = estimateEnergyKcal({
      avgRpe: 8,
      bodyweightKg: DEFAULT_BODYWEIGHT_KG,
      durationSeconds: ONE_HOUR_IN_SECONDS,
    });

    expect(kcal).toBe(380);
  });

  it('should return no energy when the workout has no duration', () => {
    const kcal = estimateEnergyKcal({ avgRpe: 8, bodyweightKg: 80, durationSeconds: 0 });

    expect(kcal).toBe(0);
  });

  it('should return no energy when the end time precedes the start time', () => {
    const kcal = estimateEnergyKcal({ avgRpe: 8, bodyweightKg: 80, durationSeconds: -60 });

    expect(kcal).toBe(0);
  });
});

describe('averageRpe', () => {
  it('should average the RPE of the working sets', () => {
    const workout = buildWorkout([buildSet({ rpe: 7 }), buildSet({ rpe: 9 })]);

    expect(averageRpe(workout)).toBe(8);
  });

  it('should ignore warmup sets', () => {
    const workout = buildWorkout([buildSet({ type: 'warmup', rpe: 6 }), buildSet({ rpe: 10 })]);

    expect(averageRpe(workout)).toBe(10);
  });

  it('should ignore sets with no RPE logged', () => {
    const workout = buildWorkout([buildSet({ rpe: null }), buildSet({ rpe: 9 })]);

    expect(averageRpe(workout)).toBe(9);
  });

  it('should return null when no set logged an RPE', () => {
    const workout = buildWorkout([buildSet(), buildSet()]);

    expect(averageRpe(workout)).toBeNull();
  });
});
