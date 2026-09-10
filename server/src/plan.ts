import type { CoachDeps } from './coach.js';
import { applyFixes, checkBlock, type Violation } from './guard.js';
import { formatCatalogue, formatHistory, type HistorySummary, historySummary, type TemplateOption, templateCatalogue, writeRoutines } from './hevy.js';
import { planTask } from './prompt.js';
import { planRequest, textOf } from './requests.js';
import { isProfile, type Block, type Exercise, type Profile } from './state.js';

const GUARD_RETRY = 'The guard rejected that block. Fix every violation below and return the whole block again.';
const GUARD_FAILED = 'The plan broke the guard twice and was not written:';
const GUARD_ADJUSTED = '**Guard adjustments**';
const EMPTY_BLOCK = 'plan attempt returned an empty block';
/** Enough of the analysis to see what the model was trying to say instead of planning. */
const ANALYSIS_LOG_MAX = 300;

export interface ProgramInput {
  profile: Profile;
  reason: string;
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

function blockSummary(block: Block): string {
  const names = block.sessions.map((session) => session.name).join(', ');
  const count = block.sessions.length;
  return `Written to Hevy: ${block.name}, ${count} session${count === 1 ? '' : 's'} — ${names}.`;
}

/** The written block and the coach's words about it, for callers that name the routines themselves. */
export interface Program {
  analysis: string;
  block: Block;
}

export async function runProgram(deps: CoachDeps, input: ProgramInput): Promise<Program> {
  const summary = await historySummary(deps.hevy);
  const catalogue = await templateCatalogue(deps.hevy, summary);
  const run: PlanRun = { deps, summary, catalogue, reason: input.reason };
  const task = planTask(input.profile, formatHistory(summary), formatCatalogue(catalogue), input.reason);

  const plan = await approvedPlan(run, task);
  const block = await writeRoutines(deps.hevy, plan.block);

  deps.state.profile = input.profile;
  deps.state.block = block;
  await deps.save();

  return { analysis: plan.analysis, block };
}

/** What the chat tool answers with: the analysis, then the sentence naming what was written. */
export async function createProgram(deps: CoachDeps, input: ProgramInput): Promise<string> {
  const { analysis, block } = await runProgram(deps, input);
  return `${analysis}\n\n${blockSummary(block)}`;
}

/** `strict` should keep the model inside the schema; this rejects the call rather than trusting it, since the profile is written to state. */
export function programInput(input: unknown): ProgramInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const { profile, reason } = input as { profile?: unknown; reason?: unknown };
  if (typeof reason !== 'string') return null;
  if (!isProfile(profile)) return null;
  return { profile, reason };
}
