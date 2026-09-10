import { describe, expect, it } from 'vitest';
import { checkBlock, MAX_JUMP, MAX_SESSIONS, MIN_SESSIONS, MIN_WEIGHT_KG, NO_HISTORY_CAP_KG, REPS, SETS } from './guard.js';
import { type HistorySummary, type TemplateOption, TOP_EXERCISES } from './hevy.js';
import type { Block, Exercise } from './state.js';

const SQUAT_ID = 'tmpl-squat';
const CURL_ID = 'tmpl-curl';
const PULL_UP_ID = 'tmpl-pull-up';
const LEG_PRESS_ID = 'tmpl-leg-press';
const BEST_SQUAT_KG = 100;
const BEST_LEG_PRESS_KG = 180;

const history: HistorySummary = {
  workouts: 24,
  firstWorkout: '2026-05-01T09:00:00.000Z',
  lastWorkout: '2026-09-09T09:00:00.000Z',
  latestBodyweightKg: 78,
  exercises: [
    {
      templateId: SQUAT_ID,
      title: 'Squat (Barbell)',
      sessions: 8,
      lastPerformed: '2026-09-09T09:00:00.000Z',
      bestWeightKg: BEST_SQUAT_KG,
      bestReps: 5,
      e1rmTrend: [110, 112, 115],
      weeklyFrequency: 2,
    },
    {
      templateId: PULL_UP_ID,
      title: 'Pull Up',
      sessions: 6,
      lastPerformed: '2026-09-08T09:00:00.000Z',
      bestWeightKg: 0,
      bestReps: 10,
      e1rmTrend: [0, 0, 0],
      weeklyFrequency: 2,
    },
  ],
};

const catalogue: TemplateOption[] = [
  { id: SQUAT_ID, title: 'Squat (Barbell)', muscleGroup: 'quadriceps', equipment: 'barbell' },
  { id: CURL_ID, title: 'Bicep Curl (Dumbbell)', muscleGroup: 'biceps', equipment: 'dumbbell' },
  { id: PULL_UP_ID, title: 'Pull Up', muscleGroup: 'lats', equipment: 'none' },
];

const baseExercise: Exercise = {
  templateId: SQUAT_ID,
  title: 'Squat (Barbell)',
  sets: 3,
  reps: 8,
  weightKg: 100,
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
        name: 'Lower A',
        focus: 'quads',
        hevyRoutineId: null,
        exercises: exercises.map((exercise) => ({ ...baseExercise, ...exercise })),
      },
      { name: 'Lower B', focus: 'hamstrings', hevyRoutineId: null, exercises: [baseExercise] },
    ],
  };
}

interface GuardCase {
  name: string;
  exercise: Partial<Exercise>;
  reasons: string[];
}

const cases: GuardCase[] = [
  {
    name: 'should allow a weight exactly at the max jump above the best logged weight',
    exercise: { weightKg: 115 },
    reasons: [],
  },
  {
    name: 'should flag a weight above the max jump',
    exercise: { weightKg: 116 },
    reasons: ['weightKg 116 is above the 115 kg cap'],
  },
  {
    name: 'should allow a weight at the no-history cap',
    exercise: { templateId: CURL_ID, title: 'Bicep Curl (Dumbbell)', weightKg: 100 },
    reasons: [],
  },
  {
    name: 'should flag a weight above the no-history cap',
    exercise: { templateId: CURL_ID, title: 'Bicep Curl (Dumbbell)', weightKg: 101 },
    reasons: ['weightKg 101 is above the 100 kg cap for a template with no logged weight'],
  },
  {
    name: 'should allow a bodyweight exercise carrying no weight',
    exercise: { templateId: PULL_UP_ID, title: 'Pull Up', weightKg: 0 },
    reasons: [],
  },
  {
    name: 'should read a best of 0 kg as no weight evidence and allow up to the no-history cap',
    exercise: { templateId: PULL_UP_ID, title: 'Pull Up', weightKg: 95 },
    reasons: [],
  },
  {
    name: 'should flag a weight above the no-history cap on a movement only ever logged unloaded',
    exercise: { templateId: PULL_UP_ID, title: 'Pull Up', weightKg: 101 },
    reasons: ['weightKg 101 is above the 100 kg cap for a template with no logged weight'],
  },
  {
    name: 'should flag a negative weight',
    exercise: { weightKg: -20 },
    reasons: ['weightKg -20 is below the 0 kg floor'],
  },
  { name: 'should allow the lowest rep count', exercise: { reps: 1 }, reasons: [] },
  { name: 'should allow the highest rep count', exercise: { reps: 30 }, reasons: [] },
  {
    name: 'should flag a rep count below the minimum',
    exercise: { reps: 0 },
    reasons: ['reps 0 is outside 1-30'],
  },
  {
    name: 'should flag a rep count above the maximum',
    exercise: { reps: 31 },
    reasons: ['reps 31 is outside 1-30'],
  },
  { name: 'should allow the lowest set count', exercise: { sets: 1 }, reasons: [] },
  { name: 'should allow the highest set count', exercise: { sets: 8 }, reasons: [] },
  {
    name: 'should flag a set count below the minimum',
    exercise: { sets: 0 },
    reasons: ['sets 0 is outside 1-8'],
  },
  {
    name: 'should flag a set count above the maximum',
    exercise: { sets: 9 },
    reasons: ['sets 9 is outside 1-8'],
  },
  {
    name: 'should flag a template id that is not in the catalogue',
    exercise: { templateId: 'tmpl-unknown' },
    reasons: ['templateId tmpl-unknown is not in the catalogue'],
  },
];

describe('checkBlock', () => {
  it.each(cases)('$name', ({ exercise, reasons }) => {
    const violations = checkBlock(blockWith(exercise), history, catalogue);

    expect(violations).toHaveLength(reasons.length);
    reasons.forEach((reason, index) => expect(violations[index].reason).toContain(reason));
  });

  it('should report every broken rule for one exercise', () => {
    const violations = checkBlock(
      blockWith({ templateId: 'tmpl-unknown', weightKg: 400, reps: 40, sets: 12 }),
      history,
      catalogue,
    );

    expect(violations.map((violation) => violation.reason)).toEqual([
      'templateId tmpl-unknown is not in the catalogue',
      'weightKg 400 is above the 100 kg cap for a template with no logged weight',
      'reps 40 is outside 1-30',
      'sets 12 is outside 1-8',
    ]);
  });

  it('should name the session and the exercise a violation came from', () => {
    const violations = checkBlock(blockWith({ weightKg: 200 }), history, catalogue);

    expect(violations[0]).toMatchObject({ session: 'Lower A', exercise: 'Squat (Barbell)' });
  });

  it('should check every exercise in a session', () => {
    const violations = checkBlock(blockWith({ reps: 99 }, { sets: 99 }, {}), history, catalogue);

    expect(violations).toHaveLength(2);
  });

  it('should cap on the real best weight for an exercise past the prompt trim', () => {
    const filler = Array.from({ length: TOP_EXERCISES }, (_, index) => ({
      ...history.exercises[0],
      templateId: `tmpl-filler-${index}`,
      title: `Filler ${index}`,
    }));
    const legPress = { ...history.exercises[0], templateId: LEG_PRESS_ID, title: 'Leg Press (Machine)', bestWeightKg: BEST_LEG_PRESS_KG };
    const deepHistory: HistorySummary = { ...history, exercises: [...filler, legPress] };
    const known: TemplateOption[] = [...catalogue, { id: LEG_PRESS_ID, title: 'Leg Press (Machine)', muscleGroup: 'quadriceps', equipment: 'machine' }];

    const violations = checkBlock(
      blockWith({ templateId: LEG_PRESS_ID, title: 'Leg Press (Machine)', weightKg: BEST_LEG_PRESS_KG }),
      deepHistory,
      known,
    );

    expect(violations).toEqual([]);
  });

  it('should flag a block with no sessions', () => {
    const empty: Block = { ...blockWith(), sessions: [] };

    expect(checkBlock(empty, history, catalogue).map((violation) => violation.reason)).toEqual([
      'sessions 0 is outside 2-6',
    ]);
  });

  it('should flag a block with more sessions than the maximum', () => {
    const base = blockWith({});
    const tooMany = MAX_SESSIONS + 1;
    const crowded: Block = { ...base, sessions: Array.from({ length: tooMany }, () => base.sessions[0]) };

    expect(checkBlock(crowded, history, catalogue).map((violation) => violation.reason)).toEqual([
      `sessions ${tooMany} is outside ${MIN_SESSIONS}-${MAX_SESSIONS}`,
    ]);
  });

  it('should flag a session that carries no exercises', () => {
    const block = blockWith({});
    block.sessions[1].exercises = [];

    expect(checkBlock(block, history, catalogue)).toEqual([
      { session: 'Lower B', exercise: 'block', reason: 'the session has no exercises' },
    ]);
  });

  it('should flag a block with an empty name', () => {
    const unnamed: Block = { ...blockWith({}), name: '' };

    expect(checkBlock(unnamed, history, catalogue)).toEqual([
      { session: 'block', exercise: 'block', reason: 'the block name is empty' },
    ]);
  });

  it('should hold the bounds the spec fixes', () => {
    expect({ MAX_JUMP, NO_HISTORY_CAP_KG, MIN_WEIGHT_KG, REPS, SETS, MIN_SESSIONS, MAX_SESSIONS }).toEqual({
      MAX_JUMP: 1.15,
      NO_HISTORY_CAP_KG: 100,
      MIN_WEIGHT_KG: 0,
      REPS: { min: 1, max: 30 },
      SETS: { min: 1, max: 8 },
      MIN_SESSIONS: 2,
      MAX_SESSIONS: 6,
    });
  });
});
