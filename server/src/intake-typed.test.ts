import { describe, expect, it } from 'vitest';
import { ANALYSIS, answered, BODYWEIGHT_KG, FEW_WORKOUTS, harness, hevyStub, last, PLAN_JSON, READ, SESSION_MINUTES, skipNotes, START_NEW, tap, toBodyweight, toInjuries, typed } from './intake-harness.js';
import { ensureOpener } from './intake.js';
import { SYSTEM_PROMPT, USER_INPUT_CLOSE, USER_INPUT_OPEN } from './prompt.js';

const UNCLEAR_JSON = JSON.stringify({ field: [], unclear: true });
const INJURY_DETAIL = 'left shoulder: no incline pressing, landmine is fine';
const NOTES_MAX = 1000;
const NEW_BODYWEIGHT_KG = 78.5;
const LOG_IN_HEVY = "Log your sessions in Hevy and I'll read them.";

const TYPED_GOAL = 'muscle mostly';

/** Past the journey question, onto the goals question of the fresh-start script. */
async function toGoals(deps: Parameters<typeof tap>[0]): Promise<void> {
  await ensureOpener(deps);
  await tap(deps, START_NEW, 'existing');
}

describe('a typed journey answer', () => {
  it('should put the athlete on the continuation when their words say so', async () => {
    const { deps, state } = harness([answered('continue')]);
    await ensureOpener(deps);

    await typed(deps, 'keep going with what I have');

    expect([state.intake?.step, state.intake?.path]).toEqual(['goals', 'continue']);
  });

  it('should re-ask the journey question when the words answer neither', async () => {
    const { deps, state } = harness([UNCLEAR_JSON]);
    await ensureOpener(deps);

    await typed(deps, 'what do you mean');

    expect([last(deps)?.choices?.length, state.intake?.step]).toEqual([2, 'journey']);
  });
});

describe('a typed answer', () => {
  it('should map the reply onto the step the script is waiting on', async () => {
    const { deps, state } = harness([answered(4)]);
    await toInjuries(deps);
    await tap(deps, 'Knee', ['knee']);

    expect(state.intake).toEqual({ step: 'bodyweight', answers: { goals: ['muscle'], daysPerWeek: 4, injuries: ['knee'] }, path: 'existing' });
  });

  it('should send the coach prompt as the system block', async () => {
    const { deps, sent } = harness([answered(['muscle'])]);
    await toGoals(deps);

    await typed(deps, TYPED_GOAL);

    expect(sent[0].system[0].text).toBe(SYSTEM_PROMPT);
  });

  it('should send the typed reply inside the untrusted delimiters', async () => {
    const { deps, sent } = harness([answered(['muscle'])]);
    await toGoals(deps);

    await typed(deps, TYPED_GOAL);

    expect(sent[0].messages[0].content).toContain(`${USER_INPUT_OPEN}\n${TYPED_GOAL}\n${USER_INPUT_CLOSE}`);
  });

  it('should ask the model for the field the step needs', async () => {
    const { deps, sent } = harness([answered(['muscle']), answered(4)]);
    await toGoals(deps);
    await typed(deps, TYPED_GOAL);

    await typed(deps, 'four ideally');

    expect(sent[1].output_config.format.schema.properties.field.type).toBe('integer');
  });

  it('should re-ask in one line with the same choices when the reply is unclear', async () => {
    const { deps, state } = harness([UNCLEAR_JSON]);
    await toGoals(deps);

    await typed(deps, 'what do you mean');

    expect([last(deps)?.text, last(deps)?.choices?.length, state.intake?.step]).toEqual([
      'I did not catch that. What are you training for?',
      5,
      'goals',
    ]);
  });
});

describe('a typed multi-answer', () => {
  it('should save the injuries the words name and move on', async () => {
    const { deps, state } = harness([answered(['shoulder'])]);
    await toInjuries(deps);

    await typed(deps, INJURY_DETAIL);

    expect([state.intake?.step, state.intake?.answers.injuries]).toEqual(['bodyweight', ['shoulder']]);
  });

  it('should keep the words of a typed injury answer in the notes', async () => {
    const { deps, state } = harness([answered(['shoulder'])]);
    await toInjuries(deps);

    await typed(deps, `  ${INJURY_DETAIL}  `);

    expect(state.intake?.answers).toEqual({ goals: ['muscle'], daysPerWeek: 4, injuries: ['shoulder'], notes: INJURY_DETAIL });
  });

  it('should carry those words into the saved profile', async () => {
    const { deps, state } = harness([answered(['shoulder']), READ, PLAN_JSON]);
    await toInjuries(deps);
    await typed(deps, INJURY_DETAIL);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);

    expect(state.profile?.notes).toBe(INJURY_DETAIL);
  });

  it('should keep the typed injury detail above the closing note', async () => {
    const { deps, state } = harness([answered(['shoulder']), READ, PLAN_JSON]);
    await toInjuries(deps);
    await typed(deps, INJURY_DETAIL);
    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    await typed(deps, 'travelling in week 3');

    expect(state.profile?.notes).toBe(`${INJURY_DETAIL}\ntravelling in week 3`);
  });

  it('should cut a very long injury answer down to the notes it keeps', async () => {
    const { deps, state } = harness([answered(['knee'])]);
    await toInjuries(deps);

    await typed(deps, 'my knee '.repeat(NOTES_MAX));

    expect(state.intake?.answers.notes).toHaveLength(NOTES_MAX);
  });

  it('should re-ask when a goals reply names no goal', async () => {
    const { deps, state } = harness([answered([])]);
    await toGoals(deps);

    await typed(deps, 'not sure yet');

    expect([last(deps)?.text, state.intake?.step]).toEqual(['I did not catch that. What are you training for?', 'goals']);
  });

  it('should move on with no injuries when the reply names nothing to work around', async () => {
    const { deps, state } = harness([answered([])]);
    await toInjuries(deps);

    await typed(deps, 'nothing hurts');

    expect([state.intake?.step, state.intake?.answers.injuries]).toEqual(['bodyweight', []]);
  });
});

describe('a typed bodyweight', () => {
  it('should hand the model the bodyweight Hevy holds when the confirmation is typed', async () => {
    const { deps, sent } = harness([answered(BODYWEIGHT_KG), READ, PLAN_JSON]);
    await toBodyweight(deps);

    await typed(deps, 'yeah still right');

    expect(sent[0].messages[0].content).toContain(`Hevy holds ${BODYWEIGHT_KG} kg for them.`);
  });

  it('should save the bodyweight Hevy holds when the athlete confirms it in words', async () => {
    const { deps, state } = harness([answered(BODYWEIGHT_KG), READ, PLAN_JSON]);
    await toBodyweight(deps);

    await typed(deps, 'yeah still right');
    await skipNotes(deps);

    expect(state.profile?.bodyweightKg).toBe(BODYWEIGHT_KG);
  });

  it('should tell the model to report unclear when Hevy holds no bodyweight to confirm', async () => {
    const { deps, sent, state } = harness([UNCLEAR_JSON], hevyStub({ measurements: [] }));
    state.intake = { step: 'bodyweight', answers: {} };

    await typed(deps, 'yeah still right');

    expect(sent[0].messages[0].content).toContain('We hold no bodyweight for them');
  });

  it('should refuse a bodyweight outside the range it accepts', async () => {
    const { deps, state } = harness([answered(900)]);
    await toBodyweight(deps);
    await tap(deps, 'It changed', 'changed');

    await typed(deps, 'nine hundred kilos');

    expect([state.intake?.step, last(deps)?.text]).toEqual(['bodyweightValue', 'I did not catch that. What is it now, in kilograms?']);
  });
});

describe('the new path, answered in words', () => {
  const REPLIES = [
    answered('3-5'),
    answered(4),
    answered('dumbbells'),
    answered(['muscle']),
    answered([]),
    answered(NEW_BODYWEIGHT_KG),
    READ,
    PLAN_JSON,
  ];

  async function walk(deps: Parameters<typeof typed>[0]): Promise<void> {
    await ensureOpener(deps);
    await typed(deps, 'about four years');
    await typed(deps, 'four days');
    await typed(deps, 'just dumbbells at home');
    await typed(deps, 'muscle mostly');
    await typed(deps, 'nothing hurts');
    await typed(deps, `${NEW_BODYWEIGHT_KG} kg`);
    await skipNotes(deps);
  }

  it('should save every answer it was given in words', async () => {
    const { deps, state } = harness(REPLIES, hevyStub({ logged: FEW_WORKOUTS }));

    await walk(deps);

    expect(state.profile).toEqual({
      goals: ['muscle'],
      daysPerWeek: 4,
      bodyweightKg: NEW_BODYWEIGHT_KG,
      injuries: [],
      notes: 'nothing hurts',
      equipment: 'dumbbells',
      sessionMinutes: SESSION_MINUTES,
      yearsTraining: '3-5',
    });
  });

  it('should close on the routine names and the line asking them to log in Hevy', async () => {
    const { deps } = harness(REPLIES, hevyStub({ logged: FEW_WORKOUTS }));

    await walk(deps);

    expect(last(deps)?.text).toBe(`${READ}\n\n${ANALYSIS}\n\n${LOG_IN_HEVY}`);
  });
});

describe('the existing path, answered in words', () => {
  const REPLIES = [answered(['muscle', 'strength']), answered(4), answered([]), answered(BODYWEIGHT_KG), READ, PLAN_JSON];

  async function walk(deps: Parameters<typeof typed>[0]): Promise<void> {
    await toGoals(deps);
    await typed(deps, 'muscle and strength');
    await typed(deps, 'four days');
    await typed(deps, 'nothing hurts');
    await typed(deps, 'still right');
    await skipNotes(deps);
  }

  it('should save every answer it was given in words', async () => {
    const { deps, state } = harness(REPLIES);

    await walk(deps);

    expect(state.profile).toEqual({
      goals: ['muscle', 'strength'],
      daysPerWeek: 4,
      bodyweightKg: BODYWEIGHT_KG,
      injuries: [],
      notes: 'nothing hurts',
      equipment: 'full_gym',
      sessionMinutes: SESSION_MINUTES,
      yearsTraining: '<1',
    });
  });

  it('should close on the routine names without the new-athlete line', async () => {
    const { deps } = harness(REPLIES);

    await walk(deps);

    expect(last(deps)?.text).toBe(`${READ}\n\n${ANALYSIS}`);
  });
});
