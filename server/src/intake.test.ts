import { describe, expect, it } from 'vitest';
import { ANALYSIS, answered, BODYWEIGHT_KG, harness, hevyStub, last, PLAN_JSON, SESSION_A, SESSION_B, SESSION_MINUTES, tap, toBodyweight, toInjuries, typed } from './intake-harness.js';
import { ensureOpener, intakeActive } from './intake.js';
import type { Profile } from './state.js';

const NEW_BODYWEIGHT_KG = 78.5;
const OPENER = "I'm your coach on top of Hevy. I've read your 2 workouts. A few questions, then I'll write your first block into Hevy.\n\nWhat are you training for?";
const OPEN_IN_HEVY = `Open Hevy \u2192 Routines \u2192 HevyCoach: ${SESSION_A}, ${SESSION_B}`;

describe('ensureOpener', () => {
  it('should welcome the athlete and ask the first question', async () => {
    const { deps } = harness();

    await ensureOpener(deps);

    expect(last(deps)?.text).toBe(OPENER);
  });

  it('should offer the five goals as pills that toggle', async () => {
    const { deps } = harness();

    await ensureOpener(deps);

    expect([last(deps)?.choices?.length, last(deps)?.multi]).toEqual([5, true]);
  });

  it('should put the script on the goals question', async () => {
    const { deps, state } = harness();

    await ensureOpener(deps);

    expect(state.intake).toEqual({ step: 'goals', answers: {} });
  });

  it('should stay quiet on a thread that already has messages', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);

    await ensureOpener(deps);

    expect(state.messages).toHaveLength(1);
  });

  it('should append one opener when two loads land together', async () => {
    const { deps, state } = harness();

    await Promise.all([ensureOpener(deps), ensureOpener(deps)]);

    expect(state.messages).toHaveLength(1);
  });

  it('should stay quiet once a profile exists', async () => {
    const { deps, state } = harness();
    state.profile = {} as Profile;

    await ensureOpener(deps);

    expect(state.messages).toHaveLength(0);
  });

  it('should leave the thread empty when Hevy cannot be read', async () => {
    const { deps, state, logs } = harness([], hevyStub([], '/v1/workouts'));

    await ensureOpener(deps);

    expect([state.messages.length, logs.length]).toEqual([0, 1]);
  });
});

describe('a tapped answer', () => {
  it('should record the goals and move to the days question', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);

    await tap(deps, 'Muscle, Strength', ['muscle', 'strength']);

    expect(state.intake).toEqual({ step: 'daysPerWeek', answers: { goals: ['muscle', 'strength'] } });
  });

  it('should keep the athlete\'s own words on the thread as their message', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);

    await tap(deps, 'Muscle, Strength', ['muscle', 'strength']);

    expect(state.messages[1]).toMatchObject({ role: 'user', text: 'Muscle, Strength' });
  });

  it('should offer two through six days', async () => {
    const { deps } = harness();
    await ensureOpener(deps);

    await tap(deps, 'Muscle', ['muscle']);

    expect(last(deps)?.choices).toEqual([2, 3, 4, 5, 6].map((day) => ({ label: `${day}`, value: `${day}` })));
  });

  it('should clear the injuries when nothing is chosen alongside them', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);
    await tap(deps, 'Muscle', ['muscle']);
    await tap(deps, '4', '4');

    await tap(deps, 'Knee, Nothing', ['knee', 'nothing']);

    expect(state.intake?.answers.injuries).toEqual([]);
  });

  it('should leave the notes empty when the injuries are tapped', async () => {
    const { deps, state } = harness();
    await toInjuries(deps);

    await tap(deps, 'Knee', ['knee']);

    expect(state.intake?.answers.notes).toBeUndefined();
  });

  it('should confirm the bodyweight Hevy holds', async () => {
    const { deps } = harness();

    await toBodyweight(deps);

    expect(last(deps)?.text).toBe(`Hevy has you at ${BODYWEIGHT_KG} kg. Still right?`);
  });

  it('should ask for a typed weight when Hevy holds no measurement', async () => {
    const { deps, state } = harness([], hevyStub([]));

    await toBodyweight(deps);

    expect([last(deps)?.text, state.intake?.step]).toEqual(['What do you weigh, in kilograms?', 'bodyweightValue']);
  });

  it('should ask what the weight is now when the athlete says it changed', async () => {
    const { deps, state } = harness();
    await toBodyweight(deps);

    await tap(deps, 'It changed', 'changed');

    expect([last(deps)?.text, last(deps)?.choices, state.intake?.step]).toEqual(['What is it now?', undefined, 'bodyweightValue']);
  });
});

describe('the last answer', () => {
  it('should write the block and name the routines once, in the last line', async () => {
    const { deps } = harness([PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    expect(last(deps)?.text).toBe(`${ANALYSIS}\n\n${OPEN_IN_HEVY}`);
  });

  it('should mark the block message as the plan', async () => {
    const { deps } = harness([PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    expect(last(deps)?.kind).toBe('plan');
  });

  it('should save the answers with the defaults the history supplies', async () => {
    const { deps, state } = harness([PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    expect(state.profile).toEqual({
      goals: ['muscle'],
      daysPerWeek: 4,
      bodyweightKg: BODYWEIGHT_KG,
      injuries: [],
      notes: '',
      equipment: 'full_gym',
      sessionMinutes: SESSION_MINUTES,
      yearsTraining: '<1',
    });
  });

  it('should take a typed weight and close the script', async () => {
    const { deps, state } = harness([answered(NEW_BODYWEIGHT_KG), PLAN_JSON]);
    await toBodyweight(deps);
    await tap(deps, 'It changed', 'changed');

    await typed(deps, `${NEW_BODYWEIGHT_KG} this morning`);

    expect([state.profile?.bodyweightKg, intakeActive(state)]).toEqual([NEW_BODYWEIGHT_KG, false]);
  });

  it('should save the bodyweight Hevy holds when the athlete confirms it in words', async () => {
    const { deps, state } = harness([answered(BODYWEIGHT_KG), PLAN_JSON]);
    await toBodyweight(deps);

    await typed(deps, 'yeah still right');

    expect([state.profile?.bodyweightKg, intakeActive(state)]).toEqual([BODYWEIGHT_KG, false]);
  });

  it('should apologise in one line and keep the profile when the block cannot be written', async () => {
    const { deps, state } = harness([PLAN_JSON], hevyStub(undefined, '/v1/routines'));
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    expect([last(deps)?.text, state.profile?.goals]).toEqual([
      'I could not write your block into Hevy just then. Ask me to try again and I will.',
      ['muscle'],
    ]);
  });
});
