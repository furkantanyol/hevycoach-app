import type { Routine, Workout } from '@furkantanyol/hevy-client';

import { daySession } from './day-session';
import type { WeekDayDetail } from './week';

const DATE = new Date(2026, 8, 10, 18, 0);

function day(overrides: Partial<WeekDayDetail>): WeekDayDetail {
  return {
    key: '2026-09-10',
    label: 'T',
    volume: 0,
    date: DATE,
    workouts: [],
    isToday: false,
    ...overrides,
  };
}

const workout = {
  id: 'workout-1',
  title: 'Push',
  description: '',
  start_time: DATE.toISOString(),
  end_time: DATE.toISOString(),
  updated_at: DATE.toISOString(),
  created_at: DATE.toISOString(),
  routine_id: null,
  exercises: [],
} satisfies Workout;

const routine = {
  id: 'routine-1',
  title: 'Pull A',
  folder_id: null,
  updated_at: DATE.toISOString(),
  created_at: DATE.toISOString(),
  exercises: [],
} satisfies Routine;

describe('daySession', () => {
  it('should print what was logged on a day that was trained', () => {
    const session = daySession(day({ workouts: [workout] }), null);

    expect(session.kind).toBe('logged');
    expect(session.title).toBe('Push');
  });

  it('should print what the routines put next on a today not trained yet', () => {
    const session = daySession(day({ isToday: true }), { routine, after: null });

    expect(session.kind).toBe('planned');
    expect(session.title).toBe('Pull A');
    expect(session.note).toBe('First in your Hevy routines.');
  });

  it('should prefer the session actually logged today over the one planned', () => {
    const session = daySession(day({ isToday: true, workouts: [workout] }), { routine, after: null });

    expect(session.kind).toBe('logged');
  });

  it('should say nothing was logged rather than call a day a rest day', () => {
    const session = daySession(day({}), { routine, after: null });

    expect(session.kind).toBe('empty');
    expect(session.note).toBe('Nothing logged in Hevy on this day.');
  });
});
