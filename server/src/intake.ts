import { type CoachDeps, describe } from './coach.js';
import { type Prefill, prefillFrom, PREFILL_WORKOUTS } from './derived.js';
import { historySummary, recentWorkouts } from './hevy.js';
import { type Answer, answerOf, CHANGED, interpret, isPath, YES } from './intake-answer.js';
import { writePlan } from './intake-plan.js';
import { type Question, QUESTIONS, WEIGH_QUESTION } from './intake-script.js';
import { NO_REPORT, type Reporter } from './progress.js';
import type { IntakePath, IntakeStep, Message, Profile, State } from './state.js';
import { newMessage } from './thread.js';

const UNCLEAR = 'I did not catch that. ';
const OPENER_FAILED = 'intake opener: could not read the Hevy history';
/** The athlete's own words are kept whole up to here; the plan prompt reads them as untrusted text. */
const NOTES_MAX = 1000;
/** Until the journey question is answered, and for a script saved before the branch existed. */
const DEFAULT_PATH: IntakePath = 'existing';
/**
 * Ten logged sessions read as a history: equipment and a weekly rhythm show in them, and there is
 * something to continue. Under that the new-to-Hevy script runs and asks what the history cannot
 * answer yet. Never ask what it already does.
 */
export const ENOUGH_HISTORY = 10;

/** What the history cannot answer, from the amendment: full gym, an hour, and a beginner's history. */
const DEFAULTS = { equipment: 'full_gym', sessionMinutes: 60, yearsTraining: '<1' } as const;
/** Only reached if a step was somehow skipped; they keep the saved profile one `isProfile` accepts. */
const FALLBACK = { goals: ['muscle'], daysPerWeek: 3, bodyweightKg: 80 } as const;

/** One reply being answered. The history is read at most once, by the steps that need it, or not at all. */
export interface Turn {
  deps: CoachDeps;
  step: IntakeStep;
  path: IntakePath;
  answers: Partial<Profile>;
  history: Prefill | null;
  /** Where the athlete hears the script: the stream of the reply being answered, or nowhere for the opener. */
  report: Reporter;
}

/**
 * 'journey' is in no list, so its answer lands on the first step of the path it chose. The continue
 * path asks least: days a week come from the history it is continuing.
 */
const PATH_STEPS: Record<IntakePath, readonly IntakeStep[]> = {
  existing: ['goals', 'daysPerWeek', 'injuries', 'bodyweight', 'notes'],
  new: ['yearsTraining', 'daysPerWeek', 'equipment', 'goals', 'injuries', 'bodyweight', 'notes'],
  continue: ['goals', 'injuries', 'bodyweight', 'notes'],
};

const hasHistory = (workouts: number): boolean => workouts >= ENOUGH_HISTORY;

const OPENING = "I'm your coach on top of Hevy.";
const CLOSING = "then I'll write your first block into Hevy.";

/** Says what was read, so the question that follows never asks what the count already answers. */
function welcome(workouts: number): string {
  if (hasHistory(workouts)) return `${OPENING} I've read your ${workouts} workouts.`;
  if (workouts === 0) return `${OPENING} Nothing is logged yet, so a few questions first, ${CLOSING}`;
  const noun = workouts === 1 ? 'workout' : 'workouts';
  return `${OPENING} I've read your ${workouts} ${noun}, too few to read your habits from yet, so a few questions first, ${CLOSING}`;
}


async function prefill(deps: CoachDeps): Promise<Prefill> {
  const summary = await historySummary(deps.hevy);
  return prefillFrom(summary, await recentWorkouts(deps.hevy, PREFILL_WORKOUTS));
}

async function history(turn: Turn): Promise<Prefill> {
  turn.history ??= await prefill(turn.deps);
  return turn.history;
}

const heldBodyweight = async (turn: Turn): Promise<number | null> => (await history(turn)).bodyweightKg;

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
  return QUESTIONS[step];
}

/** The typed bodyweight is the second half of the bodyweight step, so it moves on from the same place. */
function nextStep(path: IntakePath, step: IntakeStep): IntakeStep | null {
  const steps = PATH_STEPS[path];
  return steps[steps.indexOf(step === 'bodyweightValue' ? 'bodyweight' : step) + 1] ?? null;
}

/** The bodyweight questions carry no pills: the athlete types the number into the composer. */
function asked(text: string, question: Question): Message {
  return { ...newMessage('assistant', text), choices: question.choices, ...(question.multi && { multi: true }) };
}

function ask(turn: Turn, question: Question, prefix = ''): Promise<void> {
  const { deps, answers, path } = turn;
  const text = `${prefix}${question.text}`;
  deps.state.intake = { step: question.step, answers, path };
  deps.state.messages.push(asked(text, question));
  turn.report.say(text);
  return deps.save();
}

export function intakeActive(state: State): boolean {
  return state.intake !== null;
}

const threadIsEmpty = (state: State): boolean => state.messages.length === 0 && state.profile === null;

/**
 * The app never invents the first message. With a history the thread opens on the welcome and the
 * journey question; without one, on the first question of the new-to-Hevy script.
 */
export async function ensureOpener(deps: CoachDeps): Promise<void> {
  const { state } = deps;
  if (!threadIsEmpty(state)) return;

  try {
    const read = await prefill(deps);
    const path = hasHistory(read.workouts) ? DEFAULT_PATH : 'new';
    const step = hasHistory(read.workouts) ? 'journey' : PATH_STEPS.new[0];
    const turn: Turn = { deps, step, path, answers: {}, history: read, report: NO_REPORT };
    const question = await questionOf(step, turn);
    // Read again after the awaits: two loads landing together both pass the first guard, and the one
    // that returns first appends the opener before it yields, so the other sees it here.
    if (!threadIsEmpty(state)) return;
    await ask(turn, question, `${welcome(read.workouts)}\n\n`);
  } catch (error) {
    // The next load tries again: an opener written without the history would name a workout count it never read.
    deps.log(`${OPENER_FAILED}: ${describe(error)}`);
  }
}

/** The profile is saved before the block is written, so a failed plan leaves one they can re-run. */
async function complete(turn: Turn): Promise<void> {
  const { answers, deps } = turn;
  const past = await history(turn);
  const profile: Profile = {
    goals: answers.goals?.length ? answers.goals : [...FALLBACK.goals],
    daysPerWeek: answers.daysPerWeek ?? past.daysPerWeek ?? FALLBACK.daysPerWeek,
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

/** Only the bodyweight confirmation reads the history: its "yes" means the number Hevy holds. */
async function fromChoice(turn: Turn, choice: string | string[]): Promise<Answer | null> {
  const value = Array.isArray(choice) ? choice[0] : choice;
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
  // The closing note is kept as typed, on its own line after what the injury answer already noted.
  if (turn.step === 'notes') return { notes: [turn.answers.notes, text.trim()].filter(Boolean).join('\n').slice(0, NOTES_MAX) };
  const heldBodyweightKg = turn.step === 'bodyweight' ? await heldBodyweight(turn) : null;
  const answer = await interpret(turn.deps, { step: turn.step, heldBodyweightKg }, text);
  return turn.step === 'injuries' ? withNotes(answer, text) : answer;
}

async function advance(turn: Turn, answer: Answer): Promise<void> {
  if (answer === CHANGED) return ask(turn, QUESTIONS.bodyweightValue);
  if (isPath(answer)) return finish({ ...turn, path: answer.path });
  return finish({ ...turn, answers: { ...turn.answers, ...answer } });
}

async function reAsk(turn: Turn): Promise<void> {
  return ask(turn, await questionOf(turn.step, turn), UNCLEAR);
}

/** A tapped pill is parsed here; anything typed goes to the model, which maps it or reports it unclear. */
export async function handleIntakeReply(
  deps: CoachDeps,
  text: string,
  choice: string | string[] | undefined,
  report: Reporter = NO_REPORT,
): Promise<void> {
  const intake = deps.state.intake;
  if (!intake) return;

  deps.state.messages.push(newMessage('user', text));
  await deps.save();

  const turn: Turn = { deps, step: intake.step, path: intake.path ?? DEFAULT_PATH, answers: intake.answers, history: null, report };
  const answer = choice === undefined ? await fromTyped(turn, text) : await fromChoice(turn, choice);
  if (answer === null) return reAsk(turn);
  return advance(turn, answer);
}
