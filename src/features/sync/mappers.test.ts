import { toRoutineRow, toRoutineUpdateInput, toTemplateRow, toWorkoutRows } from './mappers';
import { buildRoutine, buildWorkout } from './test-support';

describe('toWorkoutRows', () => {
  it('should map a workout onto its own row', () => {
    const { workout } = toWorkoutRows(buildWorkout());

    expect(workout).toEqual({
      id: 'workout-1',
      title: 'Push A',
      description: 'Felt strong',
      routineId: 'routine-1',
      startTime: new Date('2026-09-08T07:00:00Z'),
      endTime: new Date('2026-09-08T08:05:00Z'),
      createdAt: new Date('2026-09-08T08:06:00Z'),
      updatedAt: new Date('2026-09-08T08:06:00Z'),
    });
  });

  it('should key children by their position, which is all Hevy gives them', () => {
    const { exercises, sets } = toWorkoutRows(buildWorkout());

    expect(exercises.map((exercise) => exercise.id)).toEqual(['workout-1:0']);
    expect(sets.map((set) => set.id)).toEqual(['workout-1:0:0', 'workout-1:0:1']);
    expect(sets.map((set) => set.workoutExerciseId)).toEqual(['workout-1:0', 'workout-1:0']);
  });

  it('should keep nulls as nulls rather than coercing them', () => {
    const workout = buildWorkout({ routine_id: null });

    workout.exercises[0].superset_id = null;
    workout.exercises[0].sets[0].reps = null;
    workout.exercises[0].sets[0].weight_kg = null;

    const rows = toWorkoutRows(workout);

    expect(rows.workout.routineId).toBeNull();
    expect(rows.exercises[0].supersetId).toBeNull();
    expect(rows.sets[0].reps).toBeNull();
    expect(rows.sets[0].weightKg).toBeNull();
  });

  it('should produce no children for a workout with no exercises', () => {
    const rows = toWorkoutRows(buildWorkout({ exercises: [] }));

    expect(rows.exercises).toEqual([]);
    expect(rows.sets).toEqual([]);
  });
});

describe('toTemplateRow', () => {
  it('should map an exercise template, keeping the muscle groups as an array', () => {
    const row = toTemplateRow({
      id: '05293BCA',
      title: 'Bench Press (Barbell)',
      type: 'weight_reps',
      primary_muscle_group: 'chest',
      secondary_muscle_groups: ['triceps', 'shoulders'],
      equipment: 'barbell',
      is_custom: false,
    });

    expect(row).toEqual({
      id: '05293BCA',
      title: 'Bench Press (Barbell)',
      type: 'weight_reps',
      primaryMuscleGroup: 'chest',
      secondaryMuscleGroups: ['triceps', 'shoulders'],
      equipment: 'barbell',
      isCustom: false,
    });
  });
});

describe('toRoutineRow', () => {
  it('should keep the routine children as JSON', () => {
    const routine = buildRoutine();

    expect(toRoutineRow(routine).exercises).toEqual(routine.exercises);
  });

});

describe('toRoutineUpdateInput', () => {
  it('should drop the fields the update body does not accept', () => {
    const input = toRoutineUpdateInput(toRoutineRow(buildRoutine()));

    expect(input.exercises?.[0]).toStrictEqual({
      exercise_template_id: '05293BCA',
      superset_id: null,
      rest_seconds: 90,
      notes: 'Slow eccentric',
      sets: [
        {
          type: 'normal',
          weight_kg: 100,
          reps: 5,
          rep_range: undefined,
          distance_meters: null,
          duration_seconds: null,
          custom_metric: null,
        },
      ],
    });
  });

  it('should send no notes, because the read model never gives us one', () => {
    expect(toRoutineUpdateInput(toRoutineRow(buildRoutine()))).not.toHaveProperty('notes');
  });
});
