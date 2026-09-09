import type { Workout } from '@furkantanyol/hevy-client';

const WARMUP = 'warmup';

/** Hevy's own grouping is `primary_muscle_group` on the exercise template; nothing is derived here. */
type TemplateMuscleGroup = {
  readonly id: string;
  readonly primary_muscle_group: string;
};

export type ExerciseSetCount = {
  readonly templateId: string;
  readonly title: string;
  readonly workingSets: number;
};

export type MuscleGroupSetCount = {
  readonly muscleGroup: string;
  readonly workingSets: number;
  /** What produced the number, most sets first. Every one of them opens its own history. */
  readonly exercises: ExerciseSetCount[];
};

/** An exercise whose template is not in the library — deleted, or not loaded yet. */
export const UNGROUPED = 'ungrouped';

/** `upper_back` is how Hevy stores it; `Upper back` is how it reads. */
export function formatMuscleGroup(muscleGroup: string): string {
  if (muscleGroup === UNGROUPED) {
    return 'Not in your exercise library';
  }
  const spaced = muscleGroup.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function countWorkingSets(sets: readonly { readonly type: string }[]): number {
  return sets.filter((set) => set.type !== WARMUP).length;
}

/**
 * Working sets per muscle group over the workouts handed in, and the exercises that produced them.
 *
 * Warmups are excluded because they are not the training stimulus the number is about. Nothing is
 * compared against a target: weekly volume caps belong to the rules engine.
 */
export function workingSetsByMuscleGroup(
  workouts: readonly Workout[],
  templates: readonly TemplateMuscleGroup[]
): MuscleGroupSetCount[] {
  const groupOf = new Map(templates.map((template) => [template.id, template.primary_muscle_group]));
  const groups = new Map<string, Map<string, ExerciseSetCount>>();

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const workingSets = countWorkingSets(exercise.sets);
      if (workingSets === 0) {
        continue;
      }

      const group = groupOf.get(exercise.exercise_template_id) ?? UNGROUPED;
      const exercises = groups.get(group) ?? new Map<string, ExerciseSetCount>();
      const running = exercises.get(exercise.exercise_template_id);

      exercises.set(exercise.exercise_template_id, {
        templateId: exercise.exercise_template_id,
        title: exercise.title,
        workingSets: (running?.workingSets ?? 0) + workingSets,
      });
      groups.set(group, exercises);
    }
  }

  return [...groups.entries()]
    .map(([muscleGroup, exercises]) => {
      const counted = [...exercises.values()].sort(
        (left, right) => right.workingSets - left.workingSets
      );
      return {
        muscleGroup,
        workingSets: counted.reduce((total, exercise) => total + exercise.workingSets, 0),
        exercises: counted,
      };
    })
    .sort((left, right) => right.workingSets - left.workingSets);
}
