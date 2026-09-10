import { describe, expect, it } from 'vitest';
import { answered, BODYWEIGHT_KG, harness, hevyStub, last, PLAN_JSON, tap, toBodyweight, toInjuries, typed } from './intake-harness.js';
import { ensureOpener } from './intake.js';
import { SYSTEM_PROMPT, USER_INPUT_CLOSE, USER_INPUT_OPEN } from './prompt.js';

const UNCLEAR_JSON = JSON.stringify({ field: [], unclear: true });
const INJURY_DETAIL = 'left shoulder: no incline pressing, landmine is fine';
const NOTES_MAX = 1000;

describe('a typed answer', () => {
  it('should map the reply onto the step the script is waiting on', async () => {
    const { deps, state } = harness([answered(4)]);
    await ensureOpener(deps);
    await tap(deps, 'Muscle', ['muscle']);

    await typed(deps, 'four ideally, three on a bad week');

    expect(state.intake).toEqual({ step: 'injuries', answers: { goals: ['muscle'], daysPerWeek: 4 } });
  });

  it('should send the coach prompt as the system block', async () => {
    const { deps, sent } = harness([answered(4)]);
    await ensureOpener(deps);
    await tap(deps, 'Muscle', ['muscle']);

    await typed(deps, 'four ideally');

    expect(sent[0].system[0].text).toBe(SYSTEM_PROMPT);
  });

  it('should send the typed reply inside the untrusted delimiters', async () => {
    const { deps, sent } = harness([answered(4)]);
    await ensureOpener(deps);
    await tap(deps, 'Muscle', ['muscle']);

    await typed(deps, 'four ideally');

    expect(sent[0].messages[0].content).toContain(`${USER_INPUT_OPEN}\nfour ideally\n${USER_INPUT_CLOSE}`);
  });

  it('should ask the model for the field the step needs', async () => {
    const { deps, sent } = harness([answered(4)]);
    await ensureOpener(deps);
    await tap(deps, 'Muscle', ['muscle']);

    await typed(deps, 'four ideally');

    expect(sent[0].output_config.format.schema.properties.field.type).toBe('integer');
  });

  it('should re-ask in one line with the same choices when the reply is unclear', async () => {
    const { deps, state } = harness([UNCLEAR_JSON]);
    await ensureOpener(deps);

    await typed(deps, 'what do you mean');

    expect([last(deps)?.text, last(deps)?.choices?.length, state.intake?.step]).toEqual([
      'I did not catch that. What are you training for?',
      5,
      'goals',
    ]);
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

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    expect(state.profile?.notes).toBe(INJURY_DETAIL);
  });

  it('should cut a very long injury answer down to the notes it keeps', async () => {
    const { deps, state } = harness([answered(['knee'])]);
    await toInjuries(deps);

    await typed(deps, 'my knee '.repeat(NOTES_MAX));

    expect(state.intake?.answers.notes).toHaveLength(NOTES_MAX);
  });

  it('should hand the model the bodyweight Hevy holds when the confirmation is typed', async () => {
    const { deps, sent } = harness([answered(BODYWEIGHT_KG), PLAN_JSON]);
    await toBodyweight(deps);

    await typed(deps, 'yeah still right');

    expect(sent[0].messages[0].content).toContain(`Hevy holds ${BODYWEIGHT_KG} kg for them.`);
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
