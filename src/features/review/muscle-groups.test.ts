import type { Workout, WorkoutExercise, WorkoutSet } from '@furkantanyol/hevy-client';

import { formatMuscleGroup, UNGROUPED, workingSetsByMuscleGroup } from './muscle-groups';

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

function buildExercise(templateId: string, title: string, sets: WorkoutSet[]): WorkoutExercise {
  return {
    index: 0,
    title,
    notes: '',
    exercise_template_id: templateId,
    superset_id: null,
    sets,
  };
}

function buildWorkout(id: string, exercises: WorkoutExercise[]): Workout {
  return {
    id,
    title: 'Session',
    routine_id: null,
    description: '',
    start_time: '2026-09-08T07:00:00Z',
    end_time: '2026-09-08T08:00:00Z',
    created_at: '2026-09-08T07:00:00Z',
    updated_at: '2026-09-08T07:00:00Z',
    exercises,
  };
}

const TEMPLATES = [
  { id: 'bench', primary_muscle_group: 'chest' },
  { id: 'fly', primary_muscle_group: 'chest' },
  { id: 'row', primary_muscle_group: 'upper_back' },
];

const WORKING_SET = buildSet(0, 'normal');

describe('workingSetsByMuscleGroup', () => {
  it('should report no groups when nothing was trained', () => {
    expect(workingSetsByMuscleGroup([], TEMPLATES)).toEqual([]);
  });

  it('should count working sets under the template primary muscle group', () => {
    const workouts = [
      buildWorkout('w1', [buildExercise('bench', 'Bench Press (Barbell)', [WORKING_SET, WORKING_SET])]),
    ];

    expect(workingSetsByMuscleGroup(workouts, TEMPLATES)).toEqual([
      {
        muscleGroup: 'chest',
        workingSets: 2,
        exercises: [{ templateId: 'bench', title: 'Bench Press (Barbell)', workingSets: 2 }],
      },
    ]);
  });

  it('should exclude warmup sets from the count', () => {
    const workouts = [
      buildWorkout('w1', [
        buildExercise('bench', 'Bench Press (Barbell)', [buildSet(0, 'warmup'), WORKING_SET]),
      ]),
    ];

    expect(workingSetsByMuscleGroup(workouts, TEMPLATES)[0].workingSets).toBe(1);
  });

  it('should drop an exercise that was only warmed up', () => {
    const workouts = [
      buildWorkout('w1', [buildExercise('bench', 'Bench Press (Barbell)', [buildSet(0, 'warmup')])]),
    ];

    expect(workingSetsByMuscleGroup(workouts, TEMPLATES)).toEqual([]);
  });

  it('should sum one exercise across several sessions', () => {
    const workouts = [
      buildWorkout('w1', [buildExercise('bench', 'Bench Press (Barbell)', [WORKING_SET])]),
      buildWorkout('w2', [buildExercise('bench', 'Bench Press (Barbell)', [WORKING_SET])]),
    ];

    expect(workingSetsByMuscleGroup(workouts, TEMPLATES)[0].exercises).toEqual([
      { templateId: 'bench', title: 'Bench Press (Barbell)', workingSets: 2 },
    ]);
  });

  it('should order groups and their exercises by working sets, heaviest first', () => {
    const workouts = [
      buildWorkout('w1', [
        buildExercise('row', 'Seated Row (Cable)', [WORKING_SET]),
        buildExercise('fly', 'Chest Fly (Machine)', [WORKING_SET]),
        buildExercise('bench', 'Bench Press (Barbell)', [WORKING_SET, WORKING_SET]),
      ]),
    ];

    const groups = workingSetsByMuscleGroup(workouts, TEMPLATES);

    expect(groups.map((group) => group.muscleGroup)).toEqual(['chest', 'upper_back']);
    expect(groups[0].exercises.map((exercise) => exercise.templateId)).toEqual(['bench', 'fly']);
  });

  it('should keep an exercise whose template is missing rather than dropping its sets', () => {
    const workouts = [buildWorkout('w1', [buildExercise('custom', 'Sled Push', [WORKING_SET])])];

    expect(workingSetsByMuscleGroup(workouts, TEMPLATES)[0].muscleGroup).toBe(UNGROUPED);
  });
});

describe('formatMuscleGroup', () => {
  it('should read Hevy underscores as words', () => {
    expect(formatMuscleGroup('upper_back')).toBe('Upper back');
  });

  it('should name the ungrouped bucket for what it is', () => {
    expect(formatMuscleGroup(UNGROUPED)).toBe('Not in your exercise library');
  });
});
