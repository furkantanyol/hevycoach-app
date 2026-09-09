import type { Workout, WorkoutSet } from '@furkantanyol/hevy-client';

import { buildWeeklyContext } from './weekly-context';

const NOW = new Date('2026-09-09T12:00:00Z');

function buildSet(index: number, type: WorkoutSet['type']): WorkoutSet {
  return {
    index,
    type,
    weight_kg: 100,
    reps: 5,
    distance_meters: null,
    duration_seconds: null,
    rpe: null,
    custom_metric: null,
  };
}

function buildWorkout(
  overrides: Partial<Workout> & Pick<Workout, 'id' | 'start_time'>
): Workout {
  return {
    title: 'Push A',
    routine_id: null,
    description: '',
    end_time: overrides.start_time,
    created_at: overrides.start_time,
    updated_at: overrides.start_time,
    exercises: [
      {
        index: 0,
        title: 'Bench Press (Barbell)',
        notes: '',
        exercise_template_id: '05293BCA',
        superset_id: null,
        sets: [buildSet(0, 'normal'), buildSet(1, 'normal')],
      },
    ],
    ...overrides,
  };
}

describe('buildWeeklyContext', () => {
  it('should report zero sessions and no workouts when there are none', () => {
    expect(buildWeeklyContext([], NOW)).toBe(
      '0 sessions and 0 working sets in the last 7 days; no workouts logged yet.'
    );
  });

  it('should count a session and its working sets from within the last 7 days', () => {
    const context = buildWeeklyContext(
      [buildWorkout({ id: 'workout-1', title: 'Push A', start_time: '2026-09-08T07:00:00Z' })],
      NOW
    );

    expect(context).toContain('1 sessions and 2 working sets in the last 7 days');
    expect(context).toContain('most recent workout "Push A" on 2026-09-08T07:00:00.000Z');
  });

  it('should exclude warmup sets from the working-set count', () => {
    const workout = buildWorkout({ id: 'workout-1', start_time: '2026-09-08T07:00:00Z' });
    workout.exercises[0].sets = [buildSet(0, 'warmup'), buildSet(1, 'normal')];

    expect(buildWeeklyContext([workout], NOW)).toContain('1 sessions and 1 working sets');
  });

  it('should count working sets across every exercise in a session', () => {
    const workout = buildWorkout({ id: 'workout-1', start_time: '2026-09-08T07:00:00Z' });
    workout.exercises = [
      ...workout.exercises,
      { ...workout.exercises[0], index: 1, sets: [buildSet(0, 'normal')] },
    ];

    expect(buildWeeklyContext([workout], NOW)).toContain('1 sessions and 3 working sets');
  });

  it('should exclude a workout older than 7 days from the session and working-set counts', () => {
    const context = buildWeeklyContext(
      [buildWorkout({ id: 'workout-old', title: 'Old Push', start_time: '2026-08-01T07:00:00Z' })],
      NOW
    );

    expect(context).toContain('0 sessions and 0 working sets in the last 7 days');
    // A quiet week still names the last session rather than claiming an empty history.
    expect(context).toContain('most recent workout "Old Push" on 2026-08-01T07:00:00.000Z');
  });

  it('should report only the single most recent workout when several are logged', () => {
    const context = buildWeeklyContext(
      [
        buildWorkout({ id: 'workout-1', title: 'Push A', start_time: '2026-09-05T07:00:00Z' }),
        buildWorkout({ id: 'workout-2', title: 'Pull A', start_time: '2026-09-07T07:00:00Z' }),
      ],
      NOW
    );

    expect(context).toContain('most recent workout "Pull A" on 2026-09-07T07:00:00.000Z');
  });

  it('should report the most recent workout regardless of the order it is handed them in', () => {
    const context = buildWeeklyContext(
      [
        buildWorkout({ id: 'workout-2', title: 'Pull A', start_time: '2026-09-07T07:00:00Z' }),
        buildWorkout({ id: 'workout-1', title: 'Push A', start_time: '2026-09-05T07:00:00Z' }),
      ],
      NOW
    );

    expect(context).toContain('most recent workout "Pull A" on 2026-09-07T07:00:00.000Z');
  });
});
