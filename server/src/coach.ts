import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { HevyClient, Workout } from '@furkantanyol/hevy-client';
import { checkBlock, type Violation } from './guard.js';
import { findSession, formatCatalogue, formatHistory, formatWorkout, type HistorySummary, historySummary, type TemplateOption, templateCatalogue, writeRoutines } from './hevy.js';
import { CREATE_PROGRAM_TOOL, MEMORY_MAX_CHARACTERS, NO_TARGETS, planTask, verdictTask } from './prompt.js';
import { PUSH_BODY_MAX } from './push.js';
import { chatRequest, planRequest, toAnthropicMessages, verdictRequest } from './requests.js';
import type { Block, Exercise, Message, Profile, Session, State } from './state.js';

export const MAX_TOOL_ROUNDS = 3;
/** The proxy in front of the server closes a streamed response after ~100 s of silence; a plan call takes longer than that. */
export const KEEPALIVE_MS = 15_000;

const PROGRESS_LINE = '\n\nReading your history and writing your block';
const HEARTBEAT = '.';
const PROGRESS_END = '\n\n';
const GUARD_RETRY = 'The guard rejected that block. Fix every violation below and return the whole block again.';
const GUARD_FAILED = 'The plan broke the guard twice and was not written:';
const UNKNOWN_TOOL = 'unknown tool';
const BAD_TOOL_INPUT = 'create_program was called with an unreadable input';

export interface CoachDeps {
  anthropic: Anthropic;
  hevy: HevyClient;
  state: State;
  save: () => Promise<void>;
  models: { plan: string; chat: string };
  log: (msg: string) => void;
}

export interface ProgramInput {
  profile: Profile;
  reason: string;
}

interface PlanResult {
  analysis: string;
  block: { name: string; weeks: number; sessions: { name: string; focus: string; exercises: Exercise[] }[] };
}

interface VerdictResult {
  message: string;
  memory: string;
}

/** `sessionName` is the matched block session; routes uses it as the push title. */
export interface Verdict {
  message: Message;
  pushBody: string;
  sessionName: string | null;
}

interface Attempt {
  analysis: string;
  block: Block;
  violations: Violation[];
}

interface PlanRun {
  deps: CoachDeps;
  summary: HistorySummary;
  catalogue: TemplateOption[];
  reason: string;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** `kind`, `block` and `session` are the fields the app reads as `metadata.custom`. */
type MessageExtras = Partial<Pick<Message, 'kind' | 'block' | 'session'>>;

function newMessage(role: Message['role'], text: string, extras: MessageExtras = {}): Message {
  const createdAt = new Date().toISOString();
  return { id: randomUUID(), role, text, createdAt, ...extras };
}

function violationLines(violations: Violation[]): string {
  return violations.map((entry) => `- ${entry.session} / ${entry.exercise}: ${entry.reason}`).join('\n');
}

function toBlock(plan: PlanResult, previous: Block | null, reason: string): Block {
  return {
    name: plan.block.name,
    weeks: plan.block.weeks,
    createdAt: new Date().toISOString(),
    reason,
    sessions: plan.block.sessions.map((session, index) => ({
      ...session,
      hevyRoutineId: previous?.sessions[index]?.hevyRoutineId ?? null,
    })),
  };
}

async function planCall(deps: CoachDeps, task: string): Promise<PlanResult> {
  const message = await deps.anthropic.messages.create(planRequest(deps.state, deps.models.plan, task));
  return JSON.parse(textOf(message)) as PlanResult;
}

async function attempt(run: PlanRun, task: string): Promise<Attempt> {
  const plan = await planCall(run.deps, task);
  const block = toBlock(plan, run.deps.state.block, run.reason);
  return { analysis: plan.analysis, block, violations: checkBlock(block, run.summary, run.catalogue) };
}

async function approvedPlan(run: PlanRun, task: string): Promise<Attempt> {
  const first = await attempt(run, task);
  if (first.violations.length === 0) return first;

  const second = await attempt(run, `${task}\n\n${GUARD_RETRY}\n${violationLines(first.violations)}`);
  if (second.violations.length > 0) {
    throw new Error(`${GUARD_FAILED}\n${violationLines(second.violations)}`);
  }
  return second;
}

function blockSummary(block: Block): string {
  const names = block.sessions.map((session) => session.name).join(', ');
  const count = block.sessions.length;
  return `Written to Hevy: ${block.name}, ${count} session${count === 1 ? '' : 's'} — ${names}.`;
}

export async function createProgram(deps: CoachDeps, input: ProgramInput): Promise<string> {
  const summary = await historySummary(deps.hevy);
  const catalogue = await templateCatalogue(deps.hevy, summary);
  const run: PlanRun = { deps, summary, catalogue, reason: input.reason };
  const task = planTask(input.profile, formatHistory(summary), formatCatalogue(catalogue), input.reason);

  const plan = await approvedPlan(run, task);
  const block = await writeRoutines(deps.hevy, plan.block);

  deps.state.profile = input.profile;
  deps.state.block = block;
  await deps.save();

  return `${plan.analysis}\n\n${blockSummary(block)}`;
}

function programInput(input: unknown): ProgramInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const { profile, reason } = input as { profile?: unknown; reason?: unknown };
  if (typeof reason !== 'string') return null;
  if (typeof profile !== 'object' || profile === null) return null;
  return { profile: profile as Profile, reason };
}

function toolResult(id: string, content: string, isError?: true): Anthropic.ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) };
}

async function runToolCall(deps: CoachDeps, call: Anthropic.ToolUseBlock, write: (chunk: string) => void): Promise<Anthropic.ToolResultBlockParam> {
  if (call.name !== CREATE_PROGRAM_TOOL.name) return toolResult(call.id, `${UNKNOWN_TOOL} ${call.name}`, true);

  const input = programInput(call.input);
  if (!input) return toolResult(call.id, BAD_TOOL_INPUT, true);

  write(PROGRESS_LINE);
  const heartbeat = setInterval(() => write(HEARTBEAT), KEEPALIVE_MS);
  try {
    return toolResult(call.id, await createProgram(deps, input));
  } catch (error) {
    deps.log(`create_program failed: ${describe(error)}`);
    return toolResult(call.id, describe(error), true);
  } finally {
    clearInterval(heartbeat);
    write(PROGRESS_END);
  }
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

export async function chatTurn(deps: CoachDeps, text: string, write: (chunk: string) => void): Promise<void> {
  deps.state.messages.push(newMessage('user', text));
  await deps.save();
  const messages = toAnthropicMessages(deps.state.messages);
  const spoken: string[] = [];
  let planned = false;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const stream = deps.anthropic.messages.stream(chatRequest(deps.state, deps.models.chat, messages));
      stream.on('text', (delta) => {
        spoken.push(delta);
        write(delta);
      });
      const message = await stream.finalMessage();
      if (message.stop_reason !== 'tool_use') break;

      const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const result = await runToolCall(deps, call, write);
        planned = planned || result.is_error !== true;
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
  return [`${session.name} — ${session.focus}`, ...lines].join('\n');
}

async function fetchWorkout(deps: CoachDeps, workoutId: string): Promise<Workout | null> {
  try {
    return await deps.hevy.workouts.get(workoutId);
  } catch (error) {
    deps.log(`verdict: could not fetch workout ${workoutId}: ${describe(error)}`);
    return null;
  }
}

async function verdictCall(deps: CoachDeps, workout: Workout, targets: string): Promise<VerdictResult> {
  const task = verdictTask(formatWorkout(workout), targets, deps.state.memory);
  const message = await deps.anthropic.messages.create(verdictRequest(deps.state, deps.models.chat, task));
  return JSON.parse(textOf(message)) as VerdictResult;
}

export async function verdict(deps: CoachDeps, workoutId: string): Promise<Verdict | null> {
  const workout = await fetchWorkout(deps, workoutId);
  if (!workout) return null;

  const session = findSession(deps.state.block, workout);
  const parsed = await verdictCall(deps, workout, session ? targetsText(session) : NO_TARGETS);

  const message = newMessage('assistant', parsed.message, {
    kind: 'verdict',
    ...(session ? { session: session.name } : {}),
  });
  deps.state.messages.push(message);
  deps.state.memory = parsed.memory.slice(0, MEMORY_MAX_CHARACTERS);
  await deps.save();

  return { message, pushBody: parsed.message.slice(0, PUSH_BODY_MAX), sessionName: session?.name ?? null };
}
