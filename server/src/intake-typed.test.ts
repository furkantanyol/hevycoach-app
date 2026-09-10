import { describe, expect, it } from 'vitest';
import { ANALYSIS, answered, BODYWEIGHT_KG, done, harness, hevyStub, last, PLAN_JSON, SESSION_A, SESSION_B, SESSION_MINUTES, tap, toBodyweight, toInjuries, typed } from './intake-harness.js';
import { ensureOpener } from './intake.js';
import { SYSTEM_PROMPT, USER_INPUT_CLOSE, USER_INPUT_OPEN } from './prompt.js';

const UNCLEAR_JSON = JSON.stringify({ field: [], unclear: true });
const INJURY_DETAIL = 'left shoulder: no incline pressing, landmine is fine';
const NOTES_MAX = 1000;
const NEW_BODYWEIGHT_KG = 78.5;
const OPEN_IN_HEVY = `Open Hevy → Routines → HevyCoach: ${SESSION_A}, ${SESSION_B}`;
const LOG_IN_HEVY = "Log your sessions in Hevy and I'll read them.";

/** Answers the opener in words, which is the only way onto a path without tapping a pill. */
async function toGoals(deps: Parameters<typeof typed>[0], path: string): Promise<void> {
  await ensureOpener(deps);
  await typed(deps, path);
}

describe('a typed answer', () => {
  it('should put the athlete on the path their words name', async () => {
    const { deps, state } = harness([answered('existing')]);

    await toGoals(deps, 'been logging for years now');

    expect([state.intake?.step, state.intake?.path]).toEqual(['goals', 'existing']);
  });

  it('should start the new athlete on the years question', async () => {
    const { deps, state } = harness([answered('new')]);

    await toGoals(deps, 'never used it before');

    expect([last(deps)?.text, state.intake?.step, state.intake?.path]).toEqual([
      'How long have you been training?',
      'yearsTraining',
      'new',
    ]);
  });

  it('should map the reply onto the step the script is waiting on', async () => {
    const { deps, state } = harness([answered(4)]);
    await toInjuries(deps);
    await tap(deps, 'Knee', 'knee');
    await done(deps);

    expect(state.intake).toEqual({ step: 'bodyweight', answers: { goals: ['muscle'], daysPerWeek: 4, injuries: ['knee'] }, path: 'existing' });
  });

  it('should send the coach prompt as the system block', async () => {
    const { deps, sent } = harness([answered('existing')]);

    await toGoals(deps, 'been logging');

    expect(sent[0].system[0].text).toBe(SYSTEM_PROMPT);
  });

  it('should send the typed reply inside the untrusted delimiters', async () => {
    const { deps, sent } = harness([answered('existing')]);

    await toGoals(deps, 'been logging');

    expect(sent[0].messages[0].content).toContain(`${USER_INPUT_OPEN}\nbeen logging\n${USER_INPUT_CLOSE}`);
  });

  it('should ask the model for the field the step needs', async () => {
    const { deps, sent } = harness([answered('existing'), answered(['muscle']), answered(4)]);
    await toGoals(deps, 'been logging');
    await typed(deps, 'muscle mostly');
    await done(deps);

    await typed(deps, 'four ideally');

    expect(sent[2].output_config.format.schema.properties.field.type).toBe('integer');
  });

  it('should re-ask in one line with the same choices when the reply is unclear', async () => {
    const { deps, state } = harness([UNCLEAR_JSON]);
    await ensureOpener(deps);

    await typed(deps, 'what do you mean');

    expect([last(deps)?.text, last(deps)?.choices?.length, state.intake?.step]).toEqual([
      'I did not catch that. New to Hevy, or been logging for a while?',
      2,
      'start',
    ]);
  });

  it('should re-ask the loop as it stands when a reply mid-loop is unclear', async () => {
    const { deps } = harness([UNCLEAR_JSON]);
    await toInjuries(deps);
    await tap(deps, 'Knee', 'knee');

    await typed(deps, 'hmm');

    expect(last(deps)?.text).toBe('I did not catch that. Anything else?');
  });
});

describe('a typed loop answer', () => {
  it('should note what it added and keep the loop open', async () => {
    const { deps } = harness([answered(['shoulder'])]);
    await toInjuries(deps);

    await typed(deps, INJURY_DETAIL);

    expect(last(deps)?.text).toBe('Shoulder, noted. Anything else?');
  });

  it('should keep the words of a typed injury answer in the notes', async () => {
    const { deps, state } = harness([answered(['shoulder'])]);
    await toInjuries(deps);

    await typed(deps, `  ${INJURY_DETAIL}  `);

    expect(state.intake?.answers).toEqual({ goals: ['muscle'], daysPerWeek: 4, injuries: ['shoulder'], notes: INJURY_DETAIL });
  });

  it('should carry those words into the saved profile', async () => {
    const { deps, state } = harness([answered(['shoulder']), PLAN_JSON]);
    await toInjuries(deps);
    await typed(deps, INJURY_DETAIL);
    await done(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    expect(state.profile?.notes).toBe(INJURY_DETAIL);
  });

  it('should cut a very long injury answer down to the notes it keeps', async () => {
    const { deps, state } = harness([answered(['knee'])]);
    await toInjuries(deps);

    await typed(deps, 'my knee '.repeat(NOTES_MAX));

    expect(state.intake?.answers.notes).toHaveLength(NOTES_MAX);
  });

  it('should close the goals loop when the reply names no more goals', async () => {
    const { deps, state } = harness([answered([])]);
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');
    await tap(deps, 'Muscle', 'muscle');

    await typed(deps, "that's everything");

    expect([state.intake?.step, state.intake?.answers.goals]).toEqual(['daysPerWeek', ['muscle']]);
  });

  it('should re-ask rather than leave the goals loop with nothing named', async () => {
    const { deps, state } = harness([answered([])]);
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');

    await typed(deps, 'not sure yet');

    expect([last(deps)?.text, state.intake?.step]).toEqual(['Pick at least one first. What are you training for?', 'goals']);
  });

  it('should close the loop when the reply names nothing to work around', async () => {
    const { deps, state } = harness([answered([])]);
    await toInjuries(deps);

    await typed(deps, 'nothing hurts');

    expect([state.intake?.step, state.intake?.answers.injuries]).toEqual(['bodyweight', []]);
  });

  it('should keep the injuries already named when the reply names no more', async () => {
    const { deps, state } = harness([answered([])]);
    await toInjuries(deps);
    await tap(deps, 'Knee', 'knee');

    await typed(deps, "no that's all");

    expect([state.intake?.step, state.intake?.answers.injuries]).toEqual(['bodyweight', ['knee']]);
  });
});

describe('a typed bodyweight', () => {
  it('should hand the model the bodyweight Hevy holds when the confirmation is typed', async () => {
    const { deps, sent } = harness([answered(BODYWEIGHT_KG), PLAN_JSON]);
    await toBodyweight(deps);

    await typed(deps, 'yeah still right');

    expect(sent[0].messages[0].content).toContain(`Hevy holds ${BODYWEIGHT_KG} kg for them.`);
  });

  it('should save the bodyweight Hevy holds when the athlete confirms it in words', async () => {
    const { deps, state } = harness([answered(BODYWEIGHT_KG), PLAN_JSON]);
    await toBodyweight(deps);

    await typed(deps, 'yeah still right');

    expect(state.profile?.bodyweightKg).toBe(BODYWEIGHT_KG);
  });

  it('should tell the model to report unclear when Hevy holds no bodyweight to confirm', async () => {
    const { deps, sent, state } = harness([UNCLEAR_JSON], hevyStub([]));
    state.intake = { step: 'bodyweight', answers: {} };

    await typed(deps, 'yeah still right');

    expect(sent[0].messages[0].content).toContain('We hold no bodyweight for them');
  });

  it('should refuse a bodyweight outside the range it accepts', async () => {
    const { deps, state } = harness([answered(900)]);
    await toBodyweight(deps);
    await tap(deps, 'It changed', 'changed');

    await typed(deps, 'nine hundred kilos');

    expect([state.intake?.step, last(deps)?.text]).toEqual(['bodyweightValue', 'I did not catch that. What is it now?']);
  });
});

describe('the new path, answered in words', () => {
  const REPLIES = [
    answered('new'),
    answered('3-5'),
    answered(4),
    answered('dumbbells'),
    answered(['muscle']),
    answered([]),
    answered(NEW_BODYWEIGHT_KG),
    PLAN_JSON,
  ];

  async function walk(deps: Parameters<typeof typed>[0]): Promise<void> {
    await toGoals(deps, 'never used Hevy before');
    await typed(deps, 'about four years');
    await typed(deps, 'four days');
    await typed(deps, 'just dumbbells at home');
    await typed(deps, 'muscle mostly');
    await done(deps);
    await typed(deps, 'nothing hurts');
    await typed(deps, `${NEW_BODYWEIGHT_KG} kg`);
  }

  it('should save every answer it was given in words', async () => {
    const { deps, state } = harness(REPLIES);

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
    const { deps } = harness(REPLIES);

    await walk(deps);

    expect(last(deps)?.text).toBe(`${ANALYSIS}\n\n${OPEN_IN_HEVY}\n\n${LOG_IN_HEVY}`);
  });
});

describe('the existing path, answered in words', () => {
  const REPLIES = [answered('existing'), answered(['muscle', 'strength']), answered(4), answered([]), answered(BODYWEIGHT_KG), PLAN_JSON];

  async function walk(deps: Parameters<typeof typed>[0]): Promise<void> {
    await toGoals(deps, 'been logging for a couple of years');
    await typed(deps, 'muscle and strength');
    await done(deps);
    await typed(deps, 'four days');
    await typed(deps, 'nothing hurts');
    await typed(deps, 'still right');
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

    expect(last(deps)?.text).toBe(`${ANALYSIS}\n\n${OPEN_IN_HEVY}`);
  });
});
