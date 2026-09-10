import { describe, expect, it } from 'vitest';
import { ANALYSIS, answered, BODYWEIGHT_KG, done, DONE_LABEL, harness, hevyStub, last, PLAN_JSON, SESSION_A, SESSION_B, SESSION_MINUTES, tap, toBodyweight, toInjuries, toNewBodyweight, typed } from './intake-harness.js';
import { ensureOpener, intakeActive } from './intake.js';
import type { Profile } from './state.js';

const NEW_BODYWEIGHT_KG = 78.5;
const WELCOME = "I'm your coach on top of Hevy. I've read your 2 workouts. A few questions, then I'll write your first block into Hevy.";
const OPENER = `${WELCOME}\n\nNew to Hevy, or been logging for a while?`;
const OPEN_IN_HEVY = `Open Hevy → Routines → HevyCoach: ${SESSION_A}, ${SESSION_B}`;
const LOG_IN_HEVY = "Log your sessions in Hevy and I'll read them.";
const BODYWEIGHT_INPUT = { kind: 'bodyweight', unit: 'kg' };

const labels = (choices: { label: string }[] | undefined): string[] => (choices ?? []).map((choice) => choice.label);

describe('ensureOpener', () => {
  it('should welcome the athlete and ask which of them is answering', async () => {
    const { deps } = harness();

    await ensureOpener(deps);

    expect(last(deps)?.text).toBe(OPENER);
  });

  it('should offer the two paths as pills', async () => {
    const { deps } = harness();

    await ensureOpener(deps);

    expect(last(deps)?.choices).toEqual([
      { label: 'New to Hevy', value: 'new' },
      { label: 'Been logging', value: 'existing' },
    ]);
  });

  it('should put the script on the opening question', async () => {
    const { deps, state } = harness();

    await ensureOpener(deps);

    expect(state.intake).toEqual({ step: 'start', answers: {}, path: 'existing' });
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

describe('a multi-answer loop', () => {
  it('should note the tapped goal and ask for another', async () => {
    const { deps } = harness();
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');

    await tap(deps, 'Muscle', 'muscle');

    expect(last(deps)?.text).toBe('Muscle, noted. Anything else?');
  });

  it('should drop the goal they picked and offer the way out', async () => {
    const { deps } = harness();
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');

    await tap(deps, 'Muscle', 'muscle');

    expect(labels(last(deps)?.choices)).toEqual(['Strength', 'Fat loss', 'Longevity', 'Athletic performance', DONE_LABEL]);
  });

  it('should keep every goal they tapped', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');
    await tap(deps, 'Muscle', 'muscle');

    await tap(deps, 'Strength', 'strength');

    expect(state.intake?.answers.goals).toEqual(['muscle', 'strength']);
  });

  it('should move on to the days question when the loop is closed', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');
    await tap(deps, 'Muscle', 'muscle');

    await done(deps);

    expect([last(deps)?.text, state.intake?.step]).toEqual(['How many days a week?', 'daysPerWeek']);
  });

  it('should re-ask rather than save a profile with no goal at all', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);
    await tap(deps, 'Been logging', 'existing');

    await done(deps);

    expect([last(deps)?.text, state.intake?.step]).toEqual(['Pick at least one first. What are you training for?', 'goals']);
  });

  it('should stop offering "Nothing" once an injury is named', async () => {
    const { deps } = harness();
    await toInjuries(deps);

    await tap(deps, 'Knee', 'knee');

    expect(labels(last(deps)?.choices)).toEqual(['Shoulder', 'Lower back', 'Elbow or wrist', 'Hip', 'Other', DONE_LABEL]);
  });

  it('should keep the notes empty when the injuries are tapped', async () => {
    const { deps, state } = harness();
    await toInjuries(deps);

    await tap(deps, 'Knee', 'knee');

    expect(state.intake?.answers.notes).toBeUndefined();
  });
});

describe('the bodyweight question', () => {
  it('should confirm the bodyweight Hevy holds on the existing path', async () => {
    const { deps } = harness();

    await toBodyweight(deps);

    expect(last(deps)?.text).toBe(`Hevy has you at ${BODYWEIGHT_KG} kg. Still right?`);
  });

  it('should ask for a typed weight when Hevy holds no measurement', async () => {
    const { deps, state } = harness([], hevyStub([]));

    await toBodyweight(deps);

    expect([last(deps)?.text, state.intake?.step]).toEqual(['What do you weigh, in kilograms?', 'bodyweightValue']);
  });

  it('should render a field instead of pills when the athlete says it changed', async () => {
    const { deps, state } = harness();
    await toBodyweight(deps);

    await tap(deps, 'It changed', 'changed');

    expect([last(deps)?.text, last(deps)?.input, last(deps)?.choices, state.intake?.step]).toEqual([
      'What is it now?',
      BODYWEIGHT_INPUT,
      undefined,
      'bodyweightValue',
    ]);
  });

  it('should ask a new athlete for the number instead of confirming one', async () => {
    const { deps, state } = harness();

    await toNewBodyweight(deps);

    expect([last(deps)?.text, last(deps)?.input, state.intake?.step]).toEqual([
      'What do you weigh, in kilograms?',
      BODYWEIGHT_INPUT,
      'bodyweightValue',
    ]);
  });
});

describe('the existing path, answered with pills', () => {
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

describe('the new path, answered with pills', () => {
  it('should close on the line asking them to log in Hevy', async () => {
    const { deps } = harness([answered(NEW_BODYWEIGHT_KG), PLAN_JSON]);
    await toNewBodyweight(deps);

    await typed(deps, `${NEW_BODYWEIGHT_KG}`);

    expect(last(deps)?.text).toBe(`${ANALYSIS}\n\n${OPEN_IN_HEVY}\n\n${LOG_IN_HEVY}`);
  });

  it('should save what the athlete answered over what the history guessed', async () => {
    const { deps, state } = harness([answered(NEW_BODYWEIGHT_KG), PLAN_JSON]);
    await toNewBodyweight(deps);

    await typed(deps, `${NEW_BODYWEIGHT_KG}`);

    expect(state.profile).toEqual({
      goals: ['muscle'],
      daysPerWeek: 4,
      bodyweightKg: NEW_BODYWEIGHT_KG,
      injuries: [],
      notes: '',
      equipment: 'home_gym',
      sessionMinutes: SESSION_MINUTES,
      yearsTraining: '5+',
    });
  });
});
