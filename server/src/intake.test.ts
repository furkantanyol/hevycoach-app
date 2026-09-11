import { describe, expect, it } from 'vitest';
import { ANALYSIS, answered, BODYWEIGHT_KG, CONTINUE, CURRENT_ROUTINE_ID, FEW_WORKOUTS, harness, hevyStub, last, LOGGED_WORKOUTS, NOTHING_TO_ADD, PLAN_JSON, READ, SESSION_A, SESSION_B, SESSION_MINUTES, skipNotes, START_NEW, tap, toBodyweight, toInjuries, toNewBodyweight, toNotes, typed } from './intake-harness.js';
import { ENOUGH_HISTORY, ensureOpener, handleIntakeReply, intakeActive } from './intake.js';
import type { Profile } from './state.js';

const NEW_BODYWEIGHT_KG = 78.5;
const WELCOME = `I'm your coach on top of Hevy. I've read your ${LOGGED_WORKOUTS} workouts.`;
const JOURNEY_QUESTION = "Start a new journey, or continue the one you're on? I'll review it and build from there.";
const OPENER = `${WELCOME}\n\n${JOURNEY_QUESTION}`;
const GOALS_QUESTION = 'What are you training for?';
const CONTINUE_REASON = 'Continuing the routines the athlete already runs';
const THIN_WELCOME = `I'm your coach on top of Hevy. I've read your ${FEW_WORKOUTS} workouts, too few to read your habits from yet, so a few questions first, then I'll write your first block into Hevy.`;
const EMPTY_WELCOME = "I'm your coach on top of Hevy. Nothing is logged yet, so a few questions first, then I'll write your first block into Hevy.";
const YEARS_QUESTION = 'How long have you been training?';
const newcomer = (texts: string[] = []) => harness(texts, hevyStub({ logged: FEW_WORKOUTS }));
const LOG_IN_HEVY = "Log your sessions in Hevy and I'll read them.";

const labels = (choices: { label: string }[] | undefined): string[] => (choices ?? []).map((choice) => choice.label);

describe('ensureOpener', () => {
  it('should welcome an athlete with a history and ask which journey', async () => {
    const { deps } = harness();

    await ensureOpener(deps);

    expect(last(deps)?.text).toBe(OPENER);
  });

  it('should offer a fresh start and a continuation as pills', async () => {
    const { deps } = harness();

    await ensureOpener(deps);

    expect(labels(last(deps)?.choices)).toEqual([START_NEW, CONTINUE]);
  });

  it('should wait on the journey question with the existing script as the default', async () => {
    const { deps, state } = harness();

    await ensureOpener(deps);

    expect(state.intake).toEqual({ step: 'journey', answers: {}, path: 'existing' });
  });

  it('should open the goals question on a fresh start', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);

    await tap(deps, START_NEW, 'existing');

    expect([last(deps)?.text, state.intake?.step, state.intake?.path]).toEqual([GOALS_QUESTION, 'goals', 'existing']);
  });

  it('should open the goals question on a continuation', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);

    await tap(deps, CONTINUE, 'continue');

    expect([last(deps)?.text, state.intake?.step, state.intake?.path]).toEqual([GOALS_QUESTION, 'goals', 'continue']);
  });

  it('should skip the days question on a continuation', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);
    await tap(deps, CONTINUE, 'continue');
    await tap(deps, 'Muscle', ['muscle']);


    expect([last(deps)?.text, state.intake?.step]).toEqual(['Anything to work around?', 'injuries']);
  });

  it('should say how little it read and start a thin history on the years question', async () => {
    const { deps, state } = newcomer();

    await ensureOpener(deps);

    expect([last(deps)?.text, state.intake?.step, state.intake?.path]).toEqual([`${THIN_WELCOME}\n\n${YEARS_QUESTION}`, 'yearsTraining', 'new']);
  });

  it('should start an empty history on the years question without a count', async () => {
    const { deps } = harness([], hevyStub({ logged: 0 }));

    await ensureOpener(deps);

    expect(last(deps)?.text).toBe(`${EMPTY_WELCOME}\n\n${YEARS_QUESTION}`);
  });

  it('should ask the journey question at exactly the workouts it takes to count as a history', async () => {
    const { deps, state } = harness([], hevyStub({ logged: ENOUGH_HISTORY }));

    await ensureOpener(deps);

    expect(state.intake?.step).toBe('journey');
  });

  it('should run the new script one workout under that', async () => {
    const { deps, state } = harness([], hevyStub({ logged: ENOUGH_HISTORY - 1 }));

    await ensureOpener(deps);

    expect([state.intake?.step, state.intake?.path]).toEqual(['yearsTraining', 'new']);
  });

  it('should count a single workout in the singular', async () => {
    const { deps } = harness([], hevyStub({ logged: 1 }));

    await ensureOpener(deps);

    expect(last(deps)?.text).toContain('your 1 workout, too few');
  });

  it('should offer the years as pills to a newcomer', async () => {
    const { deps } = newcomer();

    await ensureOpener(deps);

    expect(labels(last(deps)?.choices)).toEqual(['Less than a year', '1 to 3 years', '3 to 5 years', '5 years or more']);
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
    const { deps, state, logs } = harness([], hevyStub({ measurements: [], brokenPath: '/v1/workouts' }));

    await ensureOpener(deps);

    expect([state.messages.length, logs.length]).toEqual([0, 1]);
  });
});

describe('a multi-select question', () => {
  it('should mark the goals question as multi-select and offer every goal', async () => {
    const { deps } = harness();
    await ensureOpener(deps);

    await tap(deps, START_NEW, 'existing');

    expect([last(deps)?.multi, labels(last(deps)?.choices)]).toEqual([true, ['Muscle', 'Strength', 'Fat loss', 'Longevity', 'Athletic performance']]);
  });

  it('should save every goal sent together and move on to the days question', async () => {
    const { deps, state } = harness();
    await ensureOpener(deps);
    await tap(deps, START_NEW, 'existing');

    await tap(deps, 'Muscle, Strength', ['muscle', 'strength']);

    expect([state.intake?.answers.goals, last(deps)?.text, state.intake?.step]).toEqual([['muscle', 'strength'], 'How many days a week?', 'daysPerWeek']);
  });

  it('should offer "Nothing" as the one injuries pill that answers on its own', async () => {
    const { deps } = harness();

    await toInjuries(deps);

    expect([last(deps)?.multi, last(deps)?.choices?.at(-1)]).toEqual([true, { label: 'Nothing', value: 'nothing', exclusive: true }]);
  });

  it('should save every injury sent together', async () => {
    const { deps, state } = harness();
    await toInjuries(deps);

    await tap(deps, 'Knee, Shoulder', ['knee', 'shoulder']);

    expect([state.intake?.answers.injuries, state.intake?.step]).toEqual([['knee', 'shoulder'], 'bodyweight']);
  });

  it('should keep the notes empty when the injuries are tapped', async () => {
    const { deps, state } = harness();
    await toInjuries(deps);

    await tap(deps, 'Knee', ['knee']);

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
    const { deps, state } = harness([], hevyStub({ measurements: [] }));

    await toBodyweight(deps);

    expect([last(deps)?.text, state.intake?.step]).toEqual(['What do you weigh, in kilograms?', 'bodyweightValue']);
  });

  it('should ask for the number in the chat, with no pills, when the athlete says it changed', async () => {
    const { deps, state } = harness();
    await toBodyweight(deps);

    await tap(deps, 'It changed', 'changed');

    expect([last(deps)?.text, last(deps)?.choices, state.intake?.step]).toEqual([
      'What is it now, in kilograms?',
      [],
      'bodyweightValue',
    ]);
  });

  it('should ask a new athlete for the number instead of confirming one', async () => {
    const { deps, state } = newcomer();

    await toNewBodyweight(deps);

    expect([last(deps)?.text, last(deps)?.choices, state.intake?.step]).toEqual([
      'What do you weigh, in kilograms?',
      [],
      'bodyweightValue',
    ]);
  });
});

describe('the existing path, answered with pills', () => {
  it('should write the block and name the routines once, in the last line', async () => {
    const { deps } = harness([READ, PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);

    expect(last(deps)?.text).toBe(`${READ}\n\n${ANALYSIS}`);
  });

  it('should mark the block message as the plan', async () => {
    const { deps } = harness([READ, PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);

    expect(last(deps)?.kind).toBe('plan');
  });

  it('should save the answers with the defaults the history supplies', async () => {
    const { deps, state } = harness([READ, PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);

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
    const { deps, state } = harness([answered(NEW_BODYWEIGHT_KG), READ, PLAN_JSON]);
    await toBodyweight(deps);
    await tap(deps, 'It changed', 'changed');

    await typed(deps, `${NEW_BODYWEIGHT_KG} this morning`);
    await skipNotes(deps);

    expect([state.profile?.bodyweightKg, intakeActive(state)]).toEqual([NEW_BODYWEIGHT_KG, false]);
  });

  it('should keep the streamed read above the apology when the block cannot be written', async () => {
    const { deps, state } = harness([READ, PLAN_JSON], hevyStub({ brokenPath: '/v1/routines' }));
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);

    expect([last(deps)?.text, state.profile?.goals]).toEqual([
      `${READ}\n\nI could not write your block into Hevy just then. Ask me to try again and I will.`,
      ['muscle'],
    ]);
  });
});

describe('the continue path, answered with pills', () => {
  async function continueToPlan(deps: Parameters<typeof tap>[0]): Promise<void> {
    await ensureOpener(deps);
    await tap(deps, CONTINUE, 'continue');
    await tap(deps, 'Muscle', ['muscle']);
    await tap(deps, 'Nothing', 'nothing');
    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);
  }

  it('should hand the plan the routines the athlete runs now', async () => {
    const { deps, sent } = harness([READ, PLAN_JSON]);

    await continueToPlan(deps);

    expect(JSON.stringify(sent[1])).toContain(`## Current routines\\nLower [${CURRENT_ROUTINE_ID}]`);
  });

  it('should write the block as a continuation and take the days from the history', async () => {
    const { deps, state } = harness([READ, PLAN_JSON]);

    await continueToPlan(deps);

    expect([state.block?.reason, state.profile?.daysPerWeek]).toEqual([CONTINUE_REASON, 2]);
  });

  it('should write a fresh block, and say so, when the workouts were logged without routines', async () => {
    const { deps, state, sent } = harness([READ, PLAN_JSON], hevyStub({ routineless: true }));

    await continueToPlan(deps);

    expect([state.block?.reason, JSON.stringify(sent[1]).includes('Current routines')]).toEqual(['Initial intake', false]);
  });

  it('should report reading the routines, then each step of the plan, while it continues', async () => {
    const { deps } = harness([READ, PLAN_JSON]);
    const statuses: string[] = [];
    await ensureOpener(deps);
    await tap(deps, CONTINUE, 'continue');
    await tap(deps, 'Muscle', ['muscle']);
    await tap(deps, 'Nothing', 'nothing');
    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');

    await handleIntakeReply(deps, NOTHING_TO_ADD, 'nothing', { status: (text) => statuses.push(text), say: () => {} });

    expect(statuses).toEqual(['Reading your routines', 'Reading your workouts', 'Matching exercises', 'Writing your block', 'Saving routines to Hevy']);
  });
});

describe('the plan message', () => {
  it('should stream the read before the block is written, then the lines for the week', async () => {
    const { deps } = harness([READ, PLAN_JSON]);
    const heard: string[] = [];
    await toNotes(deps);

    await handleIntakeReply(deps, NOTHING_TO_ADD, 'nothing', { status: (text) => heard.push(`[${text}]`), say: (chunk) => heard.push(chunk) });

    expect(heard).toEqual(['[Reading your workouts]', READ, '[Matching exercises]', '[Writing your block]', '[Saving routines to Hevy]', `\n\n${ANALYSIS}`]);
  });

  it('should carry the written block on the plan message for the app to lay out', async () => {
    const { deps } = harness([READ, PLAN_JSON]);
    await toBodyweight(deps);

    await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
    await skipNotes(deps);

    expect([last(deps)?.kind, last(deps)?.block?.sessions.map((session) => session.name)]).toEqual(['plan', [SESSION_A, SESSION_B]]);
  });

  it('should stream the question the script asks next', async () => {
    const { deps } = harness();
    const heard: string[] = [];
    await ensureOpener(deps);

    await handleIntakeReply(deps, START_NEW, 'existing', { status: () => {}, say: (chunk) => heard.push(chunk) });

    expect(heard).toEqual(['What are you training for?']);
  });
});

describe('the new path, answered with pills', () => {
  it('should close on the line asking them to log in Hevy', async () => {
    const { deps } = newcomer([answered(NEW_BODYWEIGHT_KG), READ, PLAN_JSON]);
    await toNewBodyweight(deps);

    await typed(deps, `${NEW_BODYWEIGHT_KG}`);
    await skipNotes(deps);

    expect(last(deps)?.text).toBe(`${READ}\n\n${ANALYSIS}\n\n${LOG_IN_HEVY}`);
  });

  it('should save what the athlete answered over what the history guessed', async () => {
    const { deps, state } = newcomer([answered(NEW_BODYWEIGHT_KG), READ, PLAN_JSON]);
    await toNewBodyweight(deps);

    await typed(deps, `${NEW_BODYWEIGHT_KG}`);
    await skipNotes(deps);

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

describe('the closing question', () => {
  it('should ask for anything else after the bodyweight, with one pill to skip it', async () => {
    const { deps, state } = harness();

    await toNotes(deps);

    expect([last(deps)?.text, last(deps)?.choices, state.intake?.step, state.profile]).toEqual([
      'Anything else I should know before I write your block?',
      [{ label: NOTHING_TO_ADD, value: 'nothing' }],
      'notes',
      null,
    ]);
  });

  it('should keep a typed note in the profile and hand it to the plan', async () => {
    const { deps, state, sent } = harness([READ, PLAN_JSON]);
    await toNotes(deps);

    await typed(deps, '  Tuesdays and Fridays only, 45 minutes  ');

    expect([state.profile?.notes, last(deps)?.kind]).toEqual(['Tuesdays and Fridays only, 45 minutes', 'plan']);
    expect(JSON.stringify(sent[1])).toContain('Notes: Tuesdays and Fridays only, 45 minutes');
  });

  it('should write the plan with no notes when there is nothing to add', async () => {
    const { deps, state } = harness([READ, PLAN_JSON]);
    await toNotes(deps);

    await skipNotes(deps);

    expect([state.profile?.notes, last(deps)?.kind]).toEqual(['', 'plan']);
  });
});
