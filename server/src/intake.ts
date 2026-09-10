import { type CoachDeps, createProgram } from './coach.js';
import { type Prefill, prefillFrom, PREFILL_WORKOUTS } from './derived.js';
import { historySummary, recentWorkouts } from './hevy.js';
import { type Answer, answerOf, CHANGED, DAYS_PER_WEEK, interpret, NOTHING, YES } from './intake-answer.js';
import type { Choice, IntakeStep, Message, Profile, State } from './state.js';
import { newMessage } from './thread.js';

const INITIAL_REASON = 'Initial intake';
const OPEN_IN_HEVY = 'Open Hevy → Routines → HevyCoach: ';
const PLAN_FAILED = 'I could not write your block into Hevy just then. Ask me to try again and I will.';
const UNCLEAR = 'I did not catch that. ';
const OPENER_FAILED = 'intake opener: could not read the Hevy history';
const PLAN_LOG_FAILED = 'intake plan failed';

/** What the history cannot answer, from the amendment: full gym, an hour, and a beginner's history. */
const DEFAULTS = { equipment: 'full_gym', sessionMinutes: 60, yearsTraining: '<1' } as const;
/** Only reached if a step was somehow skipped; they keep the saved profile one `isProfile` accepts. */
const FALLBACK = { goals: ['muscle'], daysPerWeek: 3, bodyweightKg: 80 } as const;

interface Question {
  step: IntakeStep;
  text: string;
  choices: Choice[];
  multi: boolean;
}

/** One reply being answered. The history is read once a turn, on the steps that need it, or not at all. */
interface Turn {
  deps: CoachDeps;
  step: IntakeStep;
  answers: Partial<Profile>;
  history: Prefill | null;
}

const HISTORY_STEPS: IntakeStep[] = ['injuries', 'bodyweight', 'bodyweightValue'];

const GOAL_CHOICES: Choice[] = [
  { label: 'Muscle', value: 'muscle' },
  { label: 'Strength', value: 'strength' },
  { label: 'Fat loss', value: 'fat_loss' },
  { label: 'Longevity', value: 'longevity' },
  { label: 'Athletic performance', value: 'athletic' },
];

const DAY_CHOICES: Choice[] = DAYS_PER_WEEK.map((days) => ({ label: String(days), value: String(days) }));

const INJURY_CHOICES: Choice[] = [
  { label: 'Knee', value: 'knee' },
  { label: 'Shoulder', value: 'shoulder' },
  { label: 'Lower back', value: 'lower_back' },
  { label: 'Elbow or wrist', value: 'elbow_wrist' },
  { label: 'Hip', value: 'hip' },
  { label: 'Other', value: 'other' },
  { label: 'Nothing', value: NOTHING },
];

const GOALS_QUESTION: Question = { step: 'goals', text: 'What are you training for?', choices: GOAL_CHOICES, multi: true };
const DAYS_QUESTION: Question = { step: 'daysPerWeek', text: 'How many days a week?', choices: DAY_CHOICES, multi: false };
const INJURIES_QUESTION: Question = { step: 'injuries', text: 'Anything to work around?', choices: INJURY_CHOICES, multi: true };
const VALUE_QUESTION: Question = { step: 'bodyweightValue', text: 'What is it now?', choices: [], multi: false };
/** Asked in place of the confirmation when Hevy holds no body measurement to confirm. */
const NO_BODYWEIGHT_QUESTION: Question = { step: 'bodyweightValue', text: 'What do you weigh, in kilograms?', choices: [], multi: false };

const welcome = (workouts: number): string =>
  `I'm your coach on top of Hevy. I've read your ${workouts} workouts. A few questions, then I'll write your first block into Hevy.`;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function prefill(deps: CoachDeps): Promise<Prefill> {
  const summary = await historySummary(deps.hevy);
  return prefillFrom(summary, await recentWorkouts(deps.hevy, PREFILL_WORKOUTS));
}

function bodyweightQuestion(prefilled: number | null): Question {
  if (prefilled === null) return NO_BODYWEIGHT_QUESTION;
  return {
    step: 'bodyweight',
    text: `Hevy has you at ${prefilled} kg. Still right?`,
    choices: [
      { label: `Yes, ${prefilled} kg`, value: YES },
      { label: 'It changed', value: CHANGED },
    ],
    multi: false,
  };
}

/** The bodyweight confirmation is not here: it is rebuilt from the history, which holds its number. */
const ASKED: Record<Exclude<IntakeStep, 'bodyweight'>, Question> = {
  goals: GOALS_QUESTION,
  daysPerWeek: DAYS_QUESTION,
  injuries: INJURIES_QUESTION,
  bodyweightValue: VALUE_QUESTION,
};

/** `multi` rides alongside the choices: the app toggles those pills and sends them with one Done. */
function asked(text: string, question: Question): Message {
  const pills = question.choices.length > 0 ? { choices: question.choices, multi: question.multi } : {};
  return { ...newMessage('assistant', text), ...pills };
}

async function ask(deps: CoachDeps, question: Question, answers: Partial<Profile>, prefix = ''): Promise<void> {
  deps.state.intake = { step: question.step, answers };
  deps.state.messages.push(asked(`${prefix}${question.text}`, question));
  await deps.save();
}

export function intakeActive(state: State): boolean {
  return state.intake !== null;
}

const threadIsEmpty = (state: State): boolean => state.messages.length === 0 && state.profile === null;

/** The app never invents the first message: the thread opens with the welcome and question one. */
export async function ensureOpener(deps: CoachDeps): Promise<void> {
  const { state } = deps;
  if (!threadIsEmpty(state)) return;

  try {
    const { workouts } = await prefill(deps);
    // Read again after the history call: two loads landing together both pass the first guard, and
    // the one that returns first appends the opener before it yields, so the other sees it here.
    if (!threadIsEmpty(state)) return;
    state.intake = { step: GOALS_QUESTION.step, answers: {} };
    state.messages.push(asked(`${welcome(workouts)}\n\n${GOALS_QUESTION.text}`, GOALS_QUESTION));
    await deps.save();
  } catch (error) {
    // The next load tries again: an opener written without the history would name a workout count it never read.
    deps.log(`${OPENER_FAILED}: ${describe(error)}`);
  }
}

/** The profile is saved before the block is written, so a failed plan leaves one they can re-run. */
async function complete(turn: Turn, answers: Partial<Profile>): Promise<void> {
  const { deps } = turn;
  const history = turn.history ?? (await prefill(deps));
  const profile: Profile = {
    goals: answers.goals ?? [...FALLBACK.goals],
    daysPerWeek: answers.daysPerWeek ?? FALLBACK.daysPerWeek,
    bodyweightKg: answers.bodyweightKg ?? FALLBACK.bodyweightKg,
    injuries: answers.injuries ?? [],
    notes: answers.notes ?? '',
    equipment: history.equipment ?? DEFAULTS.equipment,
    sessionMinutes: history.sessionMinutes ?? DEFAULTS.sessionMinutes,
    yearsTraining: history.yearsTraining ?? DEFAULTS.yearsTraining,
  };

  deps.state.profile = profile;
  deps.state.intake = null;
  await deps.save();

  try {
    const written = await createProgram(deps, { profile, reason: INITIAL_REASON });
    const names = (deps.state.block?.sessions ?? []).map((session) => session.name).join(', ');
    deps.state.messages.push(newMessage('assistant', `${written}\n\n${OPEN_IN_HEVY}${names}`, { kind: 'plan' }));
  } catch (error) {
    deps.log(`${PLAN_LOG_FAILED}: ${describe(error)}`);
    deps.state.messages.push(newMessage('assistant', PLAN_FAILED));
  }
  await deps.save();
}

const heldBodyweight = (turn: Turn): number | null => turn.history?.bodyweightKg ?? null;

function nextQuestion(turn: Turn): Question | null {
  if (turn.step === 'goals') return DAYS_QUESTION;
  if (turn.step === 'daysPerWeek') return INJURIES_QUESTION;
  if (turn.step === 'injuries') return bodyweightQuestion(heldBodyweight(turn));
  return null;
}

/** Only the bodyweight confirmation reads the history: its "yes" means the number Hevy holds. */
function fromChoice(turn: Turn, choice: string | string[]): Answer | null {
  if (turn.step !== 'bodyweight') return answerOf(turn.step, choice);

  const value = Array.isArray(choice) ? choice[0] : choice;
  if (value === CHANGED) return CHANGED;
  if (value !== YES) return null;
  const held = heldBodyweight(turn);
  return held === null ? null : { bodyweightKg: held };
}

/** The model can only repeat the held bodyweight on a typed confirmation if the request carries it. */
function fromTyped(turn: Turn, text: string): Promise<Answer | null> {
  return interpret(turn.deps, { step: turn.step, heldBodyweightKg: heldBodyweight(turn) }, text);
}

async function advance(turn: Turn, answer: Answer): Promise<void> {
  if (answer === CHANGED) return ask(turn.deps, VALUE_QUESTION, turn.answers);

  const answered = { ...turn.answers, ...answer };
  const next = nextQuestion(turn);
  if (next) return ask(turn.deps, next, answered);
  return complete(turn, answered);
}

function reAsk(turn: Turn): Promise<void> {
  const question = turn.step === 'bodyweight' ? bodyweightQuestion(heldBodyweight(turn)) : ASKED[turn.step];
  return ask(turn.deps, question, turn.answers, UNCLEAR);
}

/** A tapped pill is parsed here; anything typed goes to the model, which maps it or reports it unclear. */
export async function handleIntakeReply(deps: CoachDeps, text: string, choice: string | string[] | undefined): Promise<void> {
  const intake = deps.state.intake;
  if (!intake) return;

  const { step, answers } = intake;
  deps.state.messages.push(newMessage('user', text));
  await deps.save();

  const history = HISTORY_STEPS.includes(step) ? await prefill(deps) : null;
  const turn: Turn = { deps, step, answers, history };
  const answer = choice === undefined ? await fromTyped(turn, text) : fromChoice(turn, choice);
  if (answer === null) return reAsk(turn);
  return advance(turn, answer);
}
