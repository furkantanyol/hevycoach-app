import { applyWorkouts } from './apply';
import { buildWorkout, createTestDatabase } from './test-support';
import { buildWeeklyContext } from './weekly-context';

const NOW = new Date('2026-09-09T12:00:00Z');

describe('buildWeeklyContext', () => {
  it('should report zero sessions and no workouts when the database is empty', () => {
    const db = createTestDatabase();

    expect(buildWeeklyContext(db, NOW)).toBe(
      '0 sessions and 0 working sets in the last 7 days; no workouts logged yet.'
    );
  });

  it('should count a session and its working sets from within the last 7 days', () => {
    const db = createTestDatabase();
    applyWorkouts(db, [
      buildWorkout({
        id: 'workout-1',
        title: 'Push A',
        start_time: '2026-09-08T07:00:00Z',
        end_time: '2026-09-08T08:00:00Z',
      }),
    ]);

    const context = buildWeeklyContext(db, NOW);

    // The default fixture carries two 'normal' sets on one exercise.
    expect(context).toContain('1 sessions and 2 working sets in the last 7 days');
    expect(context).toContain('most recent workout "Push A" on 2026-09-08T07:00:00.000Z');
  });

  it('should exclude warmup sets from the working-set count', () => {
    const db = createTestDatabase();
    applyWorkouts(db, [
      buildWorkout({
        id: 'workout-1',
        start_time: '2026-09-08T07:00:00Z',
        exercises: [
          {
            index: 0,
            title: 'Bench Press (Barbell)',
            notes: '',
            exercise_template_id: '05293BCA',
            superset_id: null,
            sets: [
              {
                index: 0,
                type: 'warmup',
                weight_kg: 40,
                reps: 10,
                distance_meters: null,
                duration_seconds: null,
                rpe: null,
                custom_metric: null,
              },
              {
                index: 1,
                type: 'normal',
                weight_kg: 100,
                reps: 5,
                distance_meters: null,
                duration_seconds: null,
                rpe: 8,
                custom_metric: null,
              },
            ],
          },
        ],
      }),
    ]);

    expect(buildWeeklyContext(db, NOW)).toContain('1 sessions and 1 working sets');
  });

  it('should exclude a workout older than 7 days from the session and working-set counts', () => {
    const db = createTestDatabase();
    applyWorkouts(db, [
      buildWorkout({
        id: 'workout-old',
        title: 'Old Push',
        start_time: '2026-08-01T07:00:00Z',
        end_time: '2026-08-01T08:00:00Z',
      }),
    ]);

    const context = buildWeeklyContext(db, NOW);

    expect(context).toContain('0 sessions and 0 working sets in the last 7 days');
    // The most recent workout is still surfaced even when it falls outside the 7-day window.
    expect(context).toContain('most recent workout "Old Push" on 2026-08-01T07:00:00.000Z');
  });

  it('should report only the single most recent workout when several are logged', () => {
    const db = createTestDatabase();
    applyWorkouts(db, [
      buildWorkout({
        id: 'workout-1',
        title: 'Push A',
        start_time: '2026-09-05T07:00:00Z',
        end_time: '2026-09-05T08:00:00Z',
      }),
      buildWorkout({
        id: 'workout-2',
        title: 'Pull A',
        start_time: '2026-09-07T07:00:00Z',
        end_time: '2026-09-07T08:00:00Z',
      }),
    ]);

    expect(buildWeeklyContext(db, NOW)).toContain(
      'most recent workout "Pull A" on 2026-09-07T07:00:00.000Z'
    );
  });
});
