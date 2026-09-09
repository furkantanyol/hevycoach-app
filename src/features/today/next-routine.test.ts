import type { Routine, Workout } from '@furkantanyol/hevy-client';

import { pickNextRoutine } from './next-routine';

function buildRoutine(id: string, title: string): Routine {
  return {
    id,
    title,
    folder_id: null,
    updated_at: '2026-09-01T07:00:00Z',
    created_at: '2026-09-01T07:00:00Z',
    exercises: [],
  };
}

type WorkoutOverrides = Partial<Workout> & Pick<Workout, 'id' | 'start_time'>;

function buildWorkout(overrides: WorkoutOverrides): Workout {
  return {
    title: 'Session',
    routine_id: null,
    description: '',
    end_time: overrides.start_time,
    created_at: overrides.start_time,
    updated_at: overrides.start_time,
    exercises: [],
    ...overrides,
  };
}

const PUSH = buildRoutine('routine-push', 'Push');
const PULL = buildRoutine('routine-pull', 'Pull');
const LEGS = buildRoutine('routine-legs', 'Legs');
const ROTATION = [PUSH, PULL, LEGS];

describe('pickNextRoutine', () => {
  it('should pick nothing when the user has no routines in Hevy', () => {
    expect(pickNextRoutine([], [])).toBeNull();
  });

  it('should start at the top of the list when nothing has been logged yet', () => {
    expect(pickNextRoutine(ROTATION, [])).toEqual({ routine: PUSH, after: null });
  });

  it('should pick the routine after the one last trained', () => {
    const lastTrained = buildWorkout({
      id: 'workout-1',
      start_time: '2026-09-08T07:00:00Z',
      routine_id: PUSH.id,
    });

    expect(pickNextRoutine(ROTATION, [lastTrained])).toEqual({ routine: PULL, after: lastTrained });
  });

  it('should wrap to the first routine after the last one in the list', () => {
    const lastTrained = buildWorkout({
      id: 'workout-1',
      start_time: '2026-09-08T07:00:00Z',
      routine_id: LEGS.id,
    });

    expect(pickNextRoutine(ROTATION, [lastTrained])?.routine).toBe(PUSH);
  });

  it('should follow the newest session, whatever order the workouts arrive in', () => {
    const workouts = [
      buildWorkout({ id: 'old', start_time: '2026-09-01T07:00:00Z', routine_id: LEGS.id }),
      buildWorkout({ id: 'new', start_time: '2026-09-08T07:00:00Z', routine_id: PUSH.id }),
    ];

    expect(pickNextRoutine(ROTATION, workouts)?.routine).toBe(PULL);
  });

  it('should ignore a freestyle session that belongs to no routine', () => {
    const workouts = [
      buildWorkout({ id: 'freestyle', start_time: '2026-09-09T07:00:00Z' }),
      buildWorkout({ id: 'push', start_time: '2026-09-08T07:00:00Z', routine_id: PUSH.id }),
    ];

    expect(pickNextRoutine(ROTATION, workouts)?.routine).toBe(PULL);
  });

  it('should ignore a session whose routine has since been deleted from Hevy', () => {
    const workouts = [
      buildWorkout({ id: 'deleted', start_time: '2026-09-09T07:00:00Z', routine_id: 'gone' }),
      buildWorkout({ id: 'push', start_time: '2026-09-08T07:00:00Z', routine_id: PUSH.id }),
    ];

    expect(pickNextRoutine(ROTATION, workouts)?.routine).toBe(PULL);
  });
});
