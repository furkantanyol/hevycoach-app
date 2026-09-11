import type { CoachDeps } from './coach.js';
import { applyFixes, checkBlock, type Violation } from './guard.js';
import { formatCatalogue, formatHistory, type HistorySummary, historySummary, type TemplateOption, templateCatalogue, writeRoutines } from './hevy.js';
import { planTask, readTask } from './plan-prompt.js';
import { NO_REPORT, type Reporter, withoutMarks, type Write } from './progress.js';
import { planRequest, readRequest, textOf } from './requests.js';
import { isProfile, type Block, type Exercise, type Profile } from './state.js';

const GUARD_RETRY = 'The guard rejected that block. Fix every violation below and return the whole block again.';
const GUARD_FAILED = 'The plan broke the guard twice and was not written:';
const GUARD_ADJUSTED = '**Guard adjustments**';
/** The tool result is the model's brief, not the athlete's plan: they have already read the read and the week's lines by the time it lands. */
const CONTINUE_BRIEFLY =
  'Your read and the lines for this week have already been shown to the athlete; add at most two short lines: what to do first and one question. Do not repeat them.';
const PARAGRAPH = '\n\n';
const EMPTY_BLOCK = 'plan attempt returned an empty block';
/** Enough of the analysis to see what the model was trying to say instead of planning. */
const ANALYSIS_LOG_MAX = 300;

const READING = 'Reading your workouts';
const MATCHING = 'Matching exercises';
const WRITING = 'Writing your block';
const SAVING = 'Saving routines to Hevy';

export interface ProgramInput {
  profile: Profile;
  reason: string;
  /** The routines they run now, formatted for the prompt, when the block is to continue them. */
  current?: string;
}

interface PlanResult {
  analysis: string;
  block: { name: string; weeks: number; sessions: { name: string; focus: string; exercises: Exercise[] }[] };
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

/** The shapes the guard reads as an empty block: no name, no sessions, or a session with nothing in it. */
function isEmptyBlock(block: Block): boolean {
  if (block.name.trim().length === 0) return true;
  if (block.sessions.length === 0) return true;
  return block.sessions.some((session) => session.exercises.length === 0);
}

/** An empty block usually means the model wanted to say something instead of planning; the words land in the analysis, which nothing else surfaces. */
function logEmptyBlock(deps: CoachDeps, analysis: string, block: Block): void {
  const exercises = block.sessions.reduce((total, session) => total + session.exercises.length, 0);
  const counts = `sessions: ${block.sessions.length}, exercises: ${exercises}`;
  deps.log(`${EMPTY_BLOCK} (${counts}): ${analysis.slice(0, ANALYSIS_LOG_MAX)}`);
}

async function attempt(run: PlanRun, task: string): Promise<Attempt> {
  const plan = await planCall(run.deps, task);
  const block = toBlock(plan, run.deps.state.block, run.reason);
  if (isEmptyBlock(block)) logEmptyBlock(run.deps, plan.analysis, block);
  return { analysis: plan.analysis, block, violations: checkBlock(block, run.summary, run.catalogue) };
}

function guardFailed(violations: Violation[]): Error {
  return new Error(`${GUARD_FAILED}\n${violationLines(violations)}`);
}

/** The athlete reads what the guard changed, in the plan they were already going to read. */
function withAdjustments(analysis: string, notes: string[]): string {
  return [analysis, [GUARD_ADJUSTED, ...notes.map((note) => `- ${note}`)].join('\n')].join('\n\n');
}

/** One retry is the model's chance to fix its own numbers; after that the guard bounds them itself rather than leave the athlete with nothing. */
function clamped(run: PlanRun, rejected: Attempt): Attempt {
  if (rejected.violations.some((violation) => violation.fix === undefined)) throw guardFailed(rejected.violations);

  const { block, notes } = applyFixes(rejected.block, rejected.violations);
  const violations = checkBlock(block, run.summary, run.catalogue);
  if (violations.length > 0) throw guardFailed(violations);

  return { analysis: withAdjustments(rejected.analysis, notes), block, violations };
}

async function approvedPlan(run: PlanRun, task: string): Promise<Attempt> {
  const first = await attempt(run, task);
  if (first.violations.length === 0) return first;

  const second = await attempt(run, `${task}\n\n${GUARD_RETRY}\n${violationLines(first.violations)}`);
  if (second.violations.length === 0) return second;
  return clamped(run, second);
}

const sessionNames = (block: Block): string => block.sessions.map((session) => session.name).join(', ');

function blockConfirmation(block: Block): string {
  const count = block.sessions.length;
  return `Block written to Hevy: ${block.name}, ${count} session${count === 1 ? '' : 's'} — ${sessionNames(block)}. ${CONTINUE_BRIEFLY}`;
}

/** The read the athlete saw, the lines for the week that followed it, and the block that was written. */
export interface Program {
  read: string;
  analysis: string;
  block: Block;
}

/** The read streams to the athlete word by word; the whole of it is what the block is then asked to keep its word on. */
async function streamRead(deps: CoachDeps, task: string, say: Write): Promise<string> {
  const stream = deps.anthropic.messages.stream(readRequest(deps.state, deps.models.plan, task));
  stream.on('text', (chunk: string) => say(withoutMarks(chunk)));
  return textOf(await stream.finalMessage());
}

/**
 * Two phases, so the wait has words in it: first the coach's read of the athlete, streamed within
 * seconds; then the block, written to match that read and landing with its lines for the week.
 */
export async function runProgram(deps: CoachDeps, input: ProgramInput, report: Reporter = NO_REPORT): Promise<Program> {
  report.status(READING);
  const summary = await historySummary(deps.hevy);
  const history = formatHistory(summary);
  const read = await streamRead(deps, readTask(input.profile, history, input.current), report.say);

  report.status(MATCHING);
  const catalogue = await templateCatalogue(deps.hevy, summary);
  const run: PlanRun = { deps, summary, catalogue, reason: input.reason };
  const task = planTask(input.profile, history, formatCatalogue(catalogue), input.reason, input.current, read);

  report.status(WRITING);
  const plan = await approvedPlan(run, task);
  report.status(SAVING);
  const block = await writeRoutines(deps.hevy, plan.block);

  deps.state.profile = input.profile;
  deps.state.block = block;
  await deps.save();

  report.say(`${PARAGRAPH}${plan.analysis}`);
  return { read, analysis: plan.analysis, block };
}

/** The chat tool's reply to the model: the athlete has already read everything, so it is only a brief. */
export interface ProgramReply {
  confirmation: string;
}

export async function createProgram(deps: CoachDeps, input: ProgramInput, report: Reporter = NO_REPORT): Promise<ProgramReply> {
  const { block } = await runProgram(deps, input, report);
  return { confirmation: blockConfirmation(block) };
}

/** `strict` should keep the model inside the schema; this rejects the call rather than trusting it, since the profile is written to state. */
export function programInput(input: unknown): ProgramInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const { profile, reason } = input as { profile?: unknown; reason?: unknown };
  if (typeof reason !== 'string') return null;
  if (!isProfile(profile)) return null;
  return { profile, reason };
}
