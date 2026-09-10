import { type CoachDeps, routineNamesLine, runProgram } from './coach.js';
import { type Prefill, prefillFrom, PREFILL_WORKOUTS } from './derived.js';
import { historySummary, recentWorkouts } from './hevy.js';
import { type Answer, answerOf, CHANGED, DONE, interpret, isPath, YES } from './intake-answer.js';
import { chosen, isLoopStep, labelsOf, loopQuestion, type Question, QUESTIONS, WEIGH_QUESTION } from './intake-script.js';
import type { IntakePath, IntakeStep, Message, Profile, State } from './state.js';
import { newMessage } from './thread.js';

const INITIAL_REASON = 'Initial intake';
/** The one line the new-to-Hevy script closes on: nothing reaches the coach that is not logged. */
const LOG_IN_HEVY = "Log your sessions in Hevy and I'll read them.";
const PLAN_FAILED = 'I could not write your block into Hevy just then. Ask me to try again and I will.';
const UNCLEAR = 'I did not catch that. ';
const NO_GOALS = 'Pick at least one first. ';
const NOTED = ', noted. ';
const OPENER_FAILED = 'intake opener: could not read the Hevy history';
const PLAN_LOG_FAILED = 'intake plan failed';
/** The athlete's own words are kept whole up to here; the plan prompt reads them as untrusted text. */
const NOTES_MAX = 1000;
/** Until the opener is answered, and for a script saved before the branch existed. */
const DEFAULT_PATH: IntakePath = 'existing';

/** What the history cannot answer, from the amendment: full gym, an hour, and a beginner's history. */
const DEFAULTS = { equipment: 'full_gym', sessionMinutes: 60, yearsTraining: '<1' } as const;
/** Only reached if a step was somehow skipped; they keep the saved profile one `isProfile` accepts. */
const FALLBACK = { goals: ['muscle'], daysPerWeek: 3, bodyweightKg: 80 } as const;

/** One reply being answered. The history is read at most once, by the steps that need it, or not at all. */
interface Turn {
  deps: CoachDeps;
  step: IntakeStep;
  path: IntakePath;
  answers: Partial<Profile>;
  history: Prefill | null;
}

/** 'start' is in neither list, so answering the opener lands on the first question of the branch it chose. */
const PATH_STEPS: Record<IntakePath, readonly IntakeStep[]> = {
  existing: ['goals', 'daysPerWeek', 'injuries', 'bodyweight'],
  new: ['yearsTraining', 'daysPerWeek', 'equipment', 'goals', 'injuries', 'bodyweight'],
};

const welcome = (workouts: number): string =>
  `I'm your coach on top of Hevy. I've read your ${workouts} workouts. A few questions, then I'll write your first block into Hevy.`;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function prefill(deps: CoachDeps): Promise<Prefill> {
  const summary = await historySummary(deps.hevy);
  return prefillFrom(summary, await recentWorkouts(deps.hevy, PREFILL_WORKOUTS));
}

async function history(turn: Turn): Promise<Prefill> {
  turn.history ??= await prefill(turn.deps);
  return turn.history;
}

const heldBodyweight = async (turn: Turn): Promise<number | null> => (await history(turn)).bodyweightKg;

const union = <T extends string>(before: readonly T[] = [], added: readonly T[] = []): T[] => [...new Set([...before, ...added])];

/** A loop answer only ever adds: "Nothing" is offered on the first injuries ask alone, where the list is empty. */
function merged(turn: Turn, answer: Partial<Profile>): Partial<Profile> {
  const { step } = turn;
  const answers = { ...turn.answers, ...answer };
  if (!isLoopStep(step)) return answers;
  if (step === 'goals') return { ...answers, goals: union(turn.answers.goals, answer.goals) };
  return { ...answers, injuries: union(turn.answers.injuries, answer.injuries) };
}

async function bodyweightQuestion(turn: Turn): Promise<Question> {
  const held = turn.path === 'new' ? null : await heldBodyweight(turn);
  if (held === null) return WEIGH_QUESTION;
  return {
    step: 'bodyweight',
    text: `Hevy has you at ${held} kg. Still right?`,
    choices: [
      { label: `Yes, ${held} kg`, value: YES },
      { label: 'It changed', value: CHANGED },
    ],
  };
}

/** Only the confirmation reads the history, and only the existing script has a number to confirm. */
async function questionOf(step: IntakeStep, turn: Turn): Promise<Question> {
  if (step === 'bodyweight') return bodyweightQuestion(turn);
  if (isLoopStep(step)) return loopQuestion(step, turn.answers);
  return QUESTIONS[step];
}

function nextStep(path: IntakePath, step: IntakeStep): IntakeStep | null {
  if (step === 'bodyweightValue') return null;
  const steps = PATH_STEPS[path];
  return steps[steps.indexOf(step) + 1] ?? null;
}

/** An `input` question replaces the pills: the app renders a numeric field under the message instead. */
function asked(text: string, question: Question): Message {
  const message = newMessage('assistant', text);
  if (question.input) return { ...message, input: question.input };
  return { ...message, choices: question.choices };
}

function ask(turn: Turn, question: Question, prefix = ''): Promise<void> {
  const { deps, answers, path } = turn;
  deps.state.intake = { step: question.step, answers, path };
  deps.state.messages.push(asked(`${prefix}${question.text}`, question));
  return deps.save();
}

export function intakeActive(state: State): boolean {
  return state.intake !== null;
}

const threadIsEmpty = (state: State): boolean => state.messages.length === 0 && state.profile === null;

/** The app never invents the first message: the thread opens with the welcome and the branch question. */
export async function ensureOpener(deps: CoachDeps): Promise<void> {
  const { state } = deps;
  if (!threadIsEmpty(state)) return;

  try {
    const { workouts } = await prefill(deps);
    // Read again after the history call: two loads landing together both pass the first guard, and
    // the one that returns first appends the opener before it yields, so the other sees it here.
    if (!threadIsEmpty(state)) return;
    const turn: Turn = { deps, step: 'start', path: DEFAULT_PATH, answers: {}, history: null };
    await ask(turn, QUESTIONS.start, `${welcome(workouts)}\n\n`);
  } catch (error) {
    // The next load tries again: an opener written without the history would name a workout count it never read.
    deps.log(`${OPENER_FAILED}: ${describe(error)}`);
  }
}

/** The new script closes on one extra line, because nothing they do not log ever reaches the coach. */
async function writePlan(turn: Turn, profile: Profile): Promise<void> {
  const { deps } = turn;
  try {
    const { analysis, block } = await runProgram(deps, { profile, reason: INITIAL_REASON });
    const tail = turn.path === 'new' ? [LOG_IN_HEVY] : [];
    deps.state.messages.push(newMessage('assistant', [analysis, routineNamesLine(block), ...tail].join('\n\n'), { kind: 'plan' }));
  } catch (error) {
    deps.log(`${PLAN_LOG_FAILED}: ${describe(error)}`);
    deps.state.messages.push(newMessage('assistant', PLAN_FAILED));
  }
  await deps.save();
}

/** The profile is saved before the block is written, so a failed plan leaves one they can re-run. */
async function complete(turn: Turn): Promise<void> {
  const { answers, deps } = turn;
  const past = await history(turn);
  const profile: Profile = {
    goals: answers.goals?.length ? answers.goals : [...FALLBACK.goals],
    daysPerWeek: answers.daysPerWeek ?? FALLBACK.daysPerWeek,
    bodyweightKg: answers.bodyweightKg ?? FALLBACK.bodyweightKg,
    injuries: answers.injuries ?? [],
    notes: answers.notes ?? '',
    equipment: answers.equipment ?? past.equipment ?? DEFAULTS.equipment,
    sessionMinutes: past.sessionMinutes ?? DEFAULTS.sessionMinutes,
    yearsTraining: answers.yearsTraining ?? past.yearsTraining ?? DEFAULTS.yearsTraining,
  };

  deps.state.profile = profile;
  deps.state.intake = null;
  await deps.save();
  await writePlan(turn, profile);
}

async function finish(turn: Turn): Promise<void> {
  const next = nextStep(turn.path, turn.step);
  if (next === null) return complete(turn);
  // A step is only ever entered after it is asked, so a loop step opens on its own first question.
  return ask(turn, await questionOf(next, turn));
}

/** "No, that's it" with nothing chosen would save a profile the coach cannot plan from. */
function closeLoop(turn: Turn): Promise<void> {
  if (turn.step === 'goals' && chosen('goals', turn.answers).length === 0) return ask(turn, QUESTIONS.goals, NO_GOALS);
  return finish(turn);
}

/** Only the bodyweight confirmation reads the history: its "yes" means the number Hevy holds. */
async function fromChoice(turn: Turn, choice: string | string[]): Promise<Answer | null> {
  const value = Array.isArray(choice) ? choice[0] : choice;
  if (isLoopStep(turn.step) && value === DONE) return DONE;
  if (turn.step !== 'bodyweight') return answerOf(turn.step, choice);

  if (value === CHANGED) return CHANGED;
  if (value !== YES) return null;
  const held = await heldBodyweight(turn);
  return held === null ? null : { bodyweightKg: held };
}

/** The injury list drops the specifics ("no incline pressing, landmine is fine"), so the words are kept too. */
function withNotes(answer: Answer | null, text: string): Answer | null {
  if (answer === null || typeof answer === 'string' || isPath(answer)) return answer;
  return { ...answer, notes: text.trim().slice(0, NOTES_MAX) };
}

/** The model can only repeat the held bodyweight on a typed confirmation if the request carries it. */
async function fromTyped(turn: Turn, text: string): Promise<Answer | null> {
  const heldBodyweightKg = turn.step === 'bodyweight' ? await heldBodyweight(turn) : null;
  const answer = await interpret(turn.deps, { step: turn.step, heldBodyweightKg }, text);
  return turn.step === 'injuries' ? withNotes(answer, text) : answer;
}

async function advance(turn: Turn, answer: Answer): Promise<void> {
  if (answer === CHANGED) return ask(turn, QUESTIONS.bodyweightValue);
  if (answer === DONE) return closeLoop(turn);
  if (isPath(answer)) return finish({ ...turn, path: answer.path });

  const { step } = turn;
  const answers = merged(turn, answer);
  if (!isLoopStep(step)) return finish({ ...turn, answers });
  // An answer that names nothing new closes the loop, the same as tapping "No, that's it" does.
  const added = chosen(step, answer);
  if (added.length === 0) return closeLoop({ ...turn, answers });
  return ask({ ...turn, answers }, loopQuestion(step, answers), `${labelsOf(step, added)}${NOTED}`);
}

async function reAsk(turn: Turn): Promise<void> {
  return ask(turn, await questionOf(turn.step, turn), UNCLEAR);
}

/** A tapped pill is parsed here; anything typed goes to the model, which maps it or reports it unclear. */
export async function handleIntakeReply(deps: CoachDeps, text: string, choice: string | string[] | undefined): Promise<void> {
  const intake = deps.state.intake;
  if (!intake) return;

  deps.state.messages.push(newMessage('user', text));
  await deps.save();

  const turn: Turn = { deps, step: intake.step, path: intake.path ?? DEFAULT_PATH, answers: intake.answers, history: null };
  const answer = choice === undefined ? await fromTyped(turn, text) : await fromChoice(turn, choice);
  if (answer === null) return reAsk(turn);
  return advance(turn, answer);
}
