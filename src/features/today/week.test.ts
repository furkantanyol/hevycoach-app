import type { Workout } from '@furkantanyol/hevy-client';

import { buildWeek, localDayKey, WEEK_LENGTH } from './week';

const NOW = new Date(2026, 8, 10, 18, 0);

function workout(startTime: Date, setTypes: readonly string[]): Workout {
  return {
    id: `workout-${startTime.toISOString()}`,
    title: 'Push',
    description: '',
    start_time: startTime.toISOString(),
    end_time: startTime.toISOString(),
    updated_at: startTime.toISOString(),
    created_at: startTime.toISOString(),
    routine_id: null,
    exercises: [
      {
        index: 0,
        title: 'Bench Press',
        notes: '',
        exercise_template_id: 'bench',
        superset_id: null,
        sets: setTypes.map((type, index) => ({
          index,
          type: type as 'normal' | 'warmup',
          weight_kg: 100,
          reps: 8,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        })),
      },
    ],
  };
}

describe('buildWeek', () => {
  it('should draw seven columns ending today', () => {
    const week = buildWeek([], 0, NOW);

    expect(week).toHaveLength(WEEK_LENGTH);
    expect(week.at(-1)?.key).toBe(localDayKey(NOW));
    expect(week.at(-1)?.isToday).toBe(true);
  });

  it('should count only the working sets logged on a day', () => {
    const week = buildWeek([workout(new Date(2026, 8, 8, 7, 0), ['warmup', 'normal', 'normal'])], 0, NOW);

    expect(week.find((day) => day.key === '2026-09-08')?.volume).toBe(2);
  });

  it('should count every session logged on the same day', () => {
    const morning = workout(new Date(2026, 8, 9, 7, 0), ['normal']);
    const evening = workout(new Date(2026, 8, 9, 19, 0), ['normal', 'normal']);
    const week = buildWeek([morning, evening], 0, NOW);

    expect(week.find((day) => day.key === '2026-09-09')?.volume).toBe(3);
  });

  it('should leave a day with nothing logged empty', () => {
    expect(buildWeek([], 0, NOW).at(0)?.volume).toBe(0);
  });

  it('should fall back to the planned set count on a today not trained yet', () => {
    expect(buildWeek([], 18, NOW).at(-1)?.volume).toBe(18);
  });

  it('should prefer what was actually logged today over what was planned', () => {
    const week = buildWeek([workout(new Date(2026, 8, 10, 9, 0), ['normal'])], 18, NOW);

    expect(week.at(-1)?.volume).toBe(1);
  });

  it('should ignore a session logged outside the seven days', () => {
    const week = buildWeek([workout(new Date(2026, 8, 1, 9, 0), ['normal'])], 0, NOW);

    expect(week.every((day) => day.workouts.length === 0)).toBe(true);
  });
});
