import { describe, expect, it } from 'vitest';
import { applyFixes, checkBlock, type Fix, MIN_WEIGHT_KG, NO_HISTORY_CAP_KG, REPS, SETS } from './guard.js';
import type { HistorySummary, TemplateOption } from './hevy.js';
import type { Block, Exercise } from './state.js';

const SQUAT_ID = 'tmpl-squat';
const SQUAT_TITLE = 'Squat (Barbell)';
const CURL_ID = 'tmpl-curl';
const CURL_TITLE = 'Bicep Curl (Dumbbell)';
const HIP_THRUST_ID = 'tmpl-hip-thrust';
const HIP_THRUST_TITLE = 'Hip Thrust (Barbell)';
const UNKNOWN_ID = 'tmpl-unknown';
const UNKNOWN_TITLE = 'Mystery Machine';
const SESSION_A = 'Lower A';
const BEST_SQUAT_KG = 100;
/** An odd best weight: 1.15 x 71 is 81.65 kg, so the fix has to round before the cap is loadable. */
const BEST_HIP_THRUST_KG = 71;
const HIP_THRUST_CAP_KG = 81.5;
const OVER_CAP_KG = 120;

const logged = (templateId: string, title: string, bestWeightKg: number) => ({
  templateId,
  title,
  sessions: 6,
  lastPerformed: '2026-09-09T09:00:00.000Z',
  bestWeightKg,
  bestReps: 5,
  e1rmTrend: [110, 112, 115],
  weeklyFrequency: 2,
});

const history: HistorySummary = {
  workouts: 24,
  firstWorkout: '2026-05-01T09:00:00.000Z',
  lastWorkout: '2026-09-09T09:00:00.000Z',
  latestBodyweightKg: 78,
  exercises: [
    logged(SQUAT_ID, SQUAT_TITLE, BEST_SQUAT_KG),
    logged(HIP_THRUST_ID, HIP_THRUST_TITLE, BEST_HIP_THRUST_KG),
  ],
};

const catalogue: TemplateOption[] = [
  { id: SQUAT_ID, title: SQUAT_TITLE, muscleGroup: 'quadriceps', equipment: 'barbell' },
  { id: CURL_ID, title: CURL_TITLE, muscleGroup: 'biceps', equipment: 'dumbbell' },
  { id: HIP_THRUST_ID, title: HIP_THRUST_TITLE, muscleGroup: 'glutes', equipment: 'barbell' },
];

const baseExercise: Exercise = {
  templateId: SQUAT_ID,
  title: SQUAT_TITLE,
  sets: 3,
  reps: 8,
  weightKg: BEST_SQUAT_KG,
  rpe: 8,
  note: 'two clean reps in reserve',
};

/** The cases below vary the first session; the second one is always valid, so only the count rule sees it. */
function blockWith(...exercises: Partial<Exercise>[]): Block {
  return {
    name: 'Autumn hypertrophy',
    weeks: 5,
    createdAt: '2026-09-10T12:00:00.000Z',
    reason: 'intake',
    sessions: [
      {
        name: SESSION_A,
        focus: 'quads',
        hevyRoutineId: null,
        exercises: exercises.map((exercise) => ({ ...baseExercise, ...exercise })),
      },
      { name: 'Lower B', focus: 'hamstrings', hevyRoutineId: null, exercises: [baseExercise] },
    ],
  };
}

const overCapHipThrust: Partial<Exercise> = { templateId: HIP_THRUST_ID, title: HIP_THRUST_TITLE, weightKg: OVER_CAP_KG };
const unknownExercise: Partial<Exercise> = { templateId: UNKNOWN_ID, title: UNKNOWN_TITLE };

function fixesFor(...exercises: Partial<Exercise>[]): (Fix | undefined)[] {
  return checkBlock(blockWith(...exercises), history, catalogue).map((violation) => violation.fix);
}

function fixed(...exercises: Partial<Exercise>[]) {
  const block = blockWith(...exercises);
  return applyFixes(block, checkBlock(block, history, catalogue));
}

interface BoundCase {
  name: string;
  exercise: Partial<Exercise>;
  fix: Fix;
}

const boundCases: BoundCase[] = [
  { name: 'reps above the maximum', exercise: { reps: 40 }, fix: { field: 'reps', value: REPS.max } },
  { name: 'reps below the minimum', exercise: { reps: 0 }, fix: { field: 'reps', value: REPS.min } },
  { name: 'sets above the maximum', exercise: { sets: 12 }, fix: { field: 'sets', value: SETS.max } },
  { name: 'sets below the minimum', exercise: { sets: 0 }, fix: { field: 'sets', value: SETS.min } },
];

describe('violation fixes', () => {
  it('should cap a weight over the ceiling at the cap rounded down to a loadable half kilo', () => {
    expect(fixesFor(overCapHipThrust)).toEqual([{ field: 'weightKg', value: HIP_THRUST_CAP_KG }]);
  });

  it('should cap a weight on a template with no logged weight at the no-history cap', () => {
    const curl = { templateId: CURL_ID, title: CURL_TITLE, weightKg: 140 };

    expect(fixesFor(curl)).toEqual([{ field: 'weightKg', value: NO_HISTORY_CAP_KG }]);
  });

  it('should raise a negative weight to the floor', () => {
    expect(fixesFor({ weightKg: -20 })).toEqual([{ field: 'weightKg', value: MIN_WEIGHT_KG }]);
  });

  it.each(boundCases)('should pull $name back to the nearest bound', ({ exercise, fix }) => {
    expect(fixesFor(exercise)).toEqual([fix]);
  });

  it('should drop an exercise whose template id is not in the catalogue', () => {
    expect(fixesFor(unknownExercise)).toEqual([{ drop: true }]);
  });

  it('should carry no fix for a shape violation', () => {
    const unnamed: Block = { ...blockWith({}), name: '' };

    expect(checkBlock(unnamed, history, catalogue)[0].fix).toBeUndefined();
  });
});

describe('applyFixes', () => {
  it('should cap the weight in the returned block', () => {
    expect(fixed(overCapHipThrust).block.sessions[0].exercises[0].weightKg).toBe(HIP_THRUST_CAP_KG);
  });

  it('should return a block the guard accepts', () => {
    expect(checkBlock(fixed(overCapHipThrust).block, history, catalogue)).toEqual([]);
  });

  it('should name the capped weight for the athlete', () => {
    expect(fixed(overCapHipThrust).notes).toEqual([
      `${HIP_THRUST_TITLE} in ${SESSION_A}: weight capped at ${HIP_THRUST_CAP_KG} kg (planned ${OVER_CAP_KG} kg)`,
    ]);
  });

  it('should apply every fix one exercise earned', () => {
    const broken = { ...overCapHipThrust, reps: 40, sets: 12 };

    expect(fixed(broken).block.sessions[0].exercises[0]).toMatchObject({
      weightKg: HIP_THRUST_CAP_KG,
      reps: REPS.max,
      sets: SETS.max,
    });
  });

  it('should leave the block it was given untouched', () => {
    const block = blockWith(overCapHipThrust);

    applyFixes(block, checkBlock(block, history, catalogue));

    expect(block.sessions[0].exercises[0].weightKg).toBe(OVER_CAP_KG);
  });

  it('should remove an exercise whose template id is unknown', () => {
    const titles = fixed(unknownExercise, {}).block.sessions[0].exercises.map((exercise) => exercise.title);

    expect(titles).toEqual([SQUAT_TITLE]);
  });

  it('should name the removed exercise', () => {
    expect(fixed(unknownExercise, {}).notes).toEqual([`Unknown exercise ${UNKNOWN_TITLE} removed from ${SESSION_A}`]);
  });

  it('should leave a session emptied by a drop as a shape violation', () => {
    const emptied = fixed(unknownExercise).block;

    expect(checkBlock(emptied, history, catalogue)).toEqual([
      { session: SESSION_A, exercise: 'block', reason: 'the session has no exercises' },
    ]);
  });
});
