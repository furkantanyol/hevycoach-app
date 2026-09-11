import type Anthropic from '@anthropic-ai/sdk';
import type { HevyClient, Workout } from 'hevy-sdk';
import { workoutLoggedLine } from './derived.js';
import { BLOCK_SCOPE, checkBlock, type Violation } from './guard.js';
import { findSession, formatWorkout, historySummary, templateCatalogue, writeRoutines } from './hevy.js';
import { CREATE_PROGRAM_TOOL } from './plan-prompt.js';
import { createProgram, programInput, type ProgramReply } from './plan.js';
import { progressChannel, withoutMarks, type Write } from './progress.js';
import { PUSH_BODY_MAX } from './push.js';
import { APPLY_PROPOSAL_TOOL, chatRequest, DISCARD_PROPOSAL_TOOL, reviewRequest, textOf, toAnthropicMessages } from './requests.js';
import { MEMORY_MAX_CHARACTERS, NO_TARGETS, reviewTask } from './review-prompt.js';
import type { Block, Choice, Exercise, Message, PendingProposal, Session, State } from './state.js';
import { appended, type MessageExtras, newMessage } from './thread.js';

const MAX_TOOL_ROUNDS = 3;

/** A blank line: what separates the analysis from the model's own words in the thread. */
const PARAGRAPH = '\n\n';
const THINKING = 'Thinking';
const UNKNOWN_TOOL = 'unknown tool';
const BAD_TOOL_INPUT = 'create_program was called with an unreadable input';
const UNMATCHED_PROPOSAL = 'review proposed a session the block does not hold:';
const NOTHING_PENDING = 'There is nothing to apply.';
const KEPT = 'Kept as is.';
const GUARD_REJECTED = 'The guard rejected that change, so nothing was written to Hevy:';

const PROPOSAL_CHOICES: Choice[] = [
  { label: 'Apply changes', value: 'apply' },
  { label: 'Keep as is', value: 'keep' },
];

export interface CoachDeps {
  anthropic: Anthropic;
  hevy: HevyClient;
  state: State;
  save: () => Promise<void>;
  models: { plan: string; chat: string };
  log: (msg: string) => void;
}

/** `sessionName` is the matched block session; routes uses it in the push. */
export interface Review {
  message: Message;
  pushBody: string;
  sessionName: string | null;
}

interface ReviewProposal {
  session: string;
  /** The model's one line on the change; it writes the same line into the message the athlete reads. */
  summary: string;
  exercises: Exercise[];
}

interface ReviewResult {
  message: string;
  memory: string;
  proposal: ReviewProposal | null;
}

/** `write` only reaches the screen, for progress the thread does not keep; `say` also lands in the message that is saved. */
interface Voice {
  write: Write;
  say: Write;
}

export const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));


const firstLine = (text: string): string => text.split('\n')[0];

function toolResult(id: string, content: string, isError?: true): Anthropic.ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) };
}

/** The athlete reads the coach's read and the week's lines as they are written; the model only gets a brief, so it cannot summarise over them. */
async function programResult(deps: CoachDeps, call: Anthropic.ToolUseBlock, voice: Voice): Promise<Anthropic.ToolResultBlockParam> {
  const input = programInput(call.input);
  if (!input) return toolResult(call.id, BAD_TOOL_INPUT, true);

  const progress = progressChannel(voice.write);
  try {
    voice.say(PARAGRAPH);
    const program: ProgramReply = await createProgram(deps, input, { status: progress.status, say: voice.say });
    voice.say(PARAGRAPH);
    return toolResult(call.id, program.confirmation);
  } catch (error) {
    deps.log(`create_program failed: ${describe(error)}`);
    return toolResult(call.id, describe(error), true);
  } finally {
    progress.stop();
  }
}

/** The two proposal tools answer with the text of the message they appended, so the model sees what the athlete now reads. */
async function proposalResult(
  deps: CoachDeps,
  call: Anthropic.ToolUseBlock,
  run: (deps: CoachDeps) => Promise<Message>,
): Promise<Anthropic.ToolResultBlockParam> {
  try {
    return toolResult(call.id, (await run(deps)).text);
  } catch (error) {
    deps.log(`${call.name} failed: ${describe(error)}`);
    return toolResult(call.id, describe(error), true);
  }
}

async function runToolCall(deps: CoachDeps, call: Anthropic.ToolUseBlock, voice: Voice): Promise<Anthropic.ToolResultBlockParam> {
  if (call.name === CREATE_PROGRAM_TOOL.name) return programResult(deps, call, voice);
  if (call.name === APPLY_PROPOSAL_TOOL.name) return proposalResult(deps, call, applyProposal);
  if (call.name === DISCARD_PROPOSAL_TOOL.name) return proposalResult(deps, call, discardProposal);
  return toolResult(call.id, `${UNKNOWN_TOOL} ${call.name}`, true);
}

/** A plan message carries a copy of the block, so a later re-plan cannot rewrite what the card already showed. */
function planExtras(block: Block | null): MessageExtras {
  if (!block) return {};
  return { kind: 'plan', block: structuredClone(block) };
}

/** Whatever already reached the app is persisted even when the turn fails, so a reload shows the same thread. */
async function saveReply(deps: CoachDeps, text: string, planned: boolean): Promise<void> {
  if (text.length === 0 && !planned) return;
  deps.state.messages.push(newMessage('assistant', text, planned ? planExtras(deps.state.block) : {}));
  await deps.save();
}

export async function chatTurn(deps: CoachDeps, text: string, write: Write): Promise<void> {
  deps.state.messages.push(newMessage('user', text));
  await deps.save();
  const messages = toAnthropicMessages(deps.state.messages);
  const spoken: string[] = [];
  const say = (chunk: string): void => {
    const clean = withoutMarks(chunk);
    spoken.push(clean);
    write(clean);
  };
  const voice: Voice = { write, say };
  let planned = false;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      // "Thinking" until the first token; the channel stops then so no status lands mid-sentence.
      const progress = progressChannel(write);
      progress.status(THINKING);
      const stream = deps.anthropic.messages.stream(chatRequest(deps.state, deps.models.chat, messages));
      stream.on('text', (chunk: string) => {
        progress.stop();
        say(chunk);
      });
      const message = await stream.finalMessage().finally(progress.stop);
      if (message.stop_reason !== 'tool_use') break;

      const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const result = await runToolCall(deps, call, voice);
        planned = planned || (call.name === CREATE_PROGRAM_TOOL.name && result.is_error !== true);
        results.push(result);
      }
      messages.push({ role: 'assistant', content: message.content });
      messages.push({ role: 'user', content: results });
    }
  } finally {
    await saveReply(deps, spoken.join(''), planned);
  }
}

function targetsText(session: Session): string {
  const lines = session.exercises.map(
    (exercise) => `${exercise.title}: ${exercise.sets}x${exercise.reps} @ ${exercise.weightKg} kg, RPE ${exercise.rpe}`,
  );
  return [`${session.name}: ${session.focus}`, ...lines].join('\n');
}

async function fetchWorkout(deps: CoachDeps, workoutId: string): Promise<Workout | null> {
  try {
    return await deps.hevy.workouts.get(workoutId);
  } catch (error) {
    deps.log(`review: could not fetch workout ${workoutId}: ${describe(error)}`);
    return null;
  }
}

async function reviewCall(deps: CoachDeps, workout: Workout, targets: string): Promise<ReviewResult> {
  const task = reviewTask(formatWorkout(workout), targets, deps.state.memory);
  const message = await deps.anthropic.messages.create(reviewRequest(deps.state, deps.models.chat, task));
  return JSON.parse(textOf(message)) as ReviewResult;
}

const TEXT_FIELDS = ['templateId', 'title', 'note'] as const;
const NUMBER_FIELDS = ['sets', 'reps', 'weightKg', 'rpe'] as const;

/** The proposal is persisted and later written to Hevy, so its exercises are checked rather than trusted. */
function isExercise(value: unknown): value is Exercise {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    TEXT_FIELDS.every((field) => typeof candidate[field] === 'string') &&
    NUMBER_FIELDS.every((field) => Number.isFinite(candidate[field]))
  );
}

function proposedExercises(proposal: ReviewProposal | null): Exercise[] | null {
  if (!proposal || !Array.isArray(proposal.exercises) || proposal.exercises.length === 0) return null;
  return proposal.exercises.every(isExercise) ? proposal.exercises : null;
}

/** The named session, or the one the finished workout came from when the model renamed it. */
function sessionIndexFor(block: Block | null, name: string, workout: Workout): number {
  if (!block) return -1;
  const byName = block.sessions.findIndex((session) => session.name === name);
  if (byName >= 0) return byName;
  if (!workout.routine_id) return -1;
  return block.sessions.findIndex((session) => session.hevyRoutineId === workout.routine_id);
}

function pendingFrom(deps: CoachDeps, parsed: ReviewResult, workout: Workout): Omit<PendingProposal, 'messageId'> | null {
  const exercises = proposedExercises(parsed.proposal);
  if (!parsed.proposal || !exercises) return null;

  const sessionIndex = sessionIndexFor(deps.state.block, parsed.proposal.session, workout);
  if (sessionIndex < 0) {
    deps.log(`${UNMATCHED_PROPOSAL} ${parsed.proposal.session}`);
    return null;
  }
  return { sessionIndex, exercises };
}

/** A review with no proposal also clears the last one: the block has moved on, and its pills are no longer the last word. */
export async function review(deps: CoachDeps, workoutId: string): Promise<Review | null> {
  const workout = await fetchWorkout(deps, workoutId);
  if (!workout) return null;
  deps.state.messages.push(newMessage('assistant', workoutLoggedLine(workout), { kind: 'logged' }));
  await deps.save();

  const session = findSession(deps.state.block, workout);
  const parsed = await reviewCall(deps, workout, session ? targetsText(session) : NO_TARGETS);
  const pending = pendingFrom(deps, parsed, workout);

  const message = newMessage('assistant', parsed.message, {
    kind: 'review',
    ...(session ? { session: session.name } : {}),
    ...(pending ? { choices: [...PROPOSAL_CHOICES] } : {}),
  });
  deps.state.messages.push(message);
  deps.state.memory = parsed.memory.slice(0, MEMORY_MAX_CHARACTERS);
  deps.state.pendingProposal = pending ? { ...pending, messageId: message.id } : null;
  await deps.save();

  return { message, pushBody: firstLine(parsed.message).slice(0, PUSH_BODY_MAX), sessionName: session?.name ?? null };
}

/** The pending proposal as the one session it rewrites, or null when the block moved on under it. */
function pendingSession(state: State): { index: number; session: Session } | null {
  const pending = state.pendingProposal;
  const current = pending ? state.block?.sessions[pending.sessionIndex] : undefined;
  if (!pending || !current) return null;
  return { index: pending.sessionIndex, session: { ...current, exercises: pending.exercises } };
}

/** `checkBlock` also ranges the session count; a proposal is one session by construction, so its block-wide violations do not apply. */
async function proposalViolations(deps: CoachDeps, block: Block): Promise<Violation[]> {
  const summary = await historySummary(deps.hevy);
  const catalogue = await templateCatalogue(deps.hevy, summary);
  return checkBlock(block, summary, catalogue).filter((violation) => violation.session !== BLOCK_SCOPE);
}

function problemLines(violations: Violation[]): string {
  return violations.map((entry) => `- ${entry.exercise}: ${entry.reason}`).join('\n');
}

export async function applyProposal(deps: CoachDeps): Promise<Message> {
  const pending = pendingSession(deps.state);
  const block = deps.state.block;
  if (!pending || !block) {
    deps.state.pendingProposal = null;
    return appended(deps, NOTHING_PENDING);
  }

  const oneSession: Block = { ...block, sessions: [pending.session] };
  const violations = await proposalViolations(deps, oneSession);
  if (violations.length > 0) {
    deps.state.pendingProposal = null;
    return appended(deps, `${GUARD_REJECTED}\n${problemLines(violations)}`);
  }

  // Hevy first: a failed write leaves the proposal standing, so the athlete can answer again.
  const written = await writeRoutines(deps.hevy, oneSession);
  block.sessions[pending.index] = written.sessions[0];
  deps.state.pendingProposal = null;
  return appended(deps, `Updated ${pending.session.name} in Hevy.`);
}

export async function discardProposal(deps: CoachDeps): Promise<Message> {
  deps.state.pendingProposal = null;
  return appended(deps, KEPT);
}
