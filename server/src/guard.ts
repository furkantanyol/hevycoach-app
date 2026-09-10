import type { HistorySummary, TemplateOption } from './hevy.js';
import type { Block, Exercise } from './state.js';

export const MAX_JUMP = 1.15;
export const NO_HISTORY_CAP_KG = 100;
export const REPS = { min: 1, max: 30 } as const;
export const SETS = { min: 1, max: 8 } as const;
export const MIN_WEIGHT_KG = 0;
export const MIN_SESSIONS = 2;
export const MAX_SESSIONS = 6;

/** The one number to rewrite, or the exercise going away because its template id is not real. */
export type FieldFix = { field: 'weightKg' | 'reps' | 'sets'; value: number };
export type Fix = FieldFix | { drop: true };

export interface Violation {
  session: string;
  exercise: string;
  reason: string;
  /** What would satisfy the guard without another model call; absent when only a re-plan can. */
  fix?: Fix;
}

/** A broken rule before it knows which session and exercise it came from. */
interface Finding {
  reason: string;
  fix?: Fix;
}

interface Range {
  min: number;
  max: number;
}

const CAP_DECIMAL_PLACES = 2;
const KG_STEP = 0.5;
const SESSIONS: Range = { min: MIN_SESSIONS, max: MAX_SESSIONS };
/** Block-level violations have no exercise to name, so they carry this in place of one; the review filters on it. */
export const BLOCK_SCOPE = 'block';
const EMPTY_NAME = 'the block name is empty';
const EMPTY_SESSION = 'the session has no exercises';
const FIELD_LABELS = { weightKg: 'weight', reps: 'reps', sets: 'sets' } as const;
const KG = ' kg';

/** Cables and bodyweight movements are logged at 0 kg, so a best of 0 is no weight evidence, not a 0 kg ceiling. */
function hasWeightEvidence(bestWeightKg: number | undefined): bestWeightKg is number {
  return bestWeightKg !== undefined && bestWeightKg > 0;
}

function weightCapKg(bestWeightKg: number | undefined): number {
  if (!hasWeightEvidence(bestWeightKg)) return NO_HISTORY_CAP_KG;
  return Number((MAX_JUMP * bestWeightKg).toFixed(CAP_DECIMAL_PLACES));
}

/** Plates come in half kilos, and rounding down keeps a fixed load under the cap instead of back over it. */
function loadableKg(capKg: number): number {
  return Math.floor(capKg / KG_STEP) * KG_STEP;
}

function weightFinding(exercise: Exercise, bestWeightKg: number | undefined): Finding | null {
  if (exercise.weightKg < MIN_WEIGHT_KG) {
    const reason = `weightKg ${exercise.weightKg} is below the ${MIN_WEIGHT_KG} kg floor`;
    return { reason, fix: { field: 'weightKg', value: MIN_WEIGHT_KG } };
  }
  const capKg = weightCapKg(bestWeightKg);
  if (exercise.weightKg <= capKg) return null;
  const fix: Fix = { field: 'weightKg', value: loadableKg(capKg) };
  if (!hasWeightEvidence(bestWeightKg)) {
    const reason = `weightKg ${exercise.weightKg} is above the ${NO_HISTORY_CAP_KG} kg cap for a template with no logged weight`;
    return { reason, fix };
  }
  const reason = `weightKg ${exercise.weightKg} is above the ${capKg} kg cap (${MAX_JUMP} x best logged ${bestWeightKg} kg)`;
  return { reason, fix };
}

function rangeReason(label: string, value: number, range: Range): string | null {
  if (value >= range.min && value <= range.max) return null;
  return `${label} ${value} is outside ${range.min}-${range.max}`;
}

/** The nearest bound is the smallest change that satisfies the guard, so a fix never moves a number further than it must. */
function rangeFinding(field: FieldFix['field'], value: number, range: Range): Finding | null {
  const reason = rangeReason(field, value, range);
  if (reason === null) return null;
  return { reason, fix: { field, value: Math.min(Math.max(value, range.min), range.max) } };
}

function catalogueFinding(exercise: Exercise, knownTemplateIds: Set<string>): Finding | null {
  if (knownTemplateIds.has(exercise.templateId)) return null;
  return { reason: `templateId ${exercise.templateId} is not in the catalogue`, fix: { drop: true } };
}

function findingsFor(
  exercise: Exercise,
  bestWeightByTemplate: Map<string, number>,
  knownTemplateIds: Set<string>,
): Finding[] {
  const findings = [
    catalogueFinding(exercise, knownTemplateIds),
    weightFinding(exercise, bestWeightByTemplate.get(exercise.templateId)),
    rangeFinding('reps', exercise.reps, REPS),
    rangeFinding('sets', exercise.sets, SETS),
  ];
  return findings.filter((finding): finding is Finding => finding !== null);
}

/** The shape the model must return: a named block of real sessions, each holding at least one exercise. */
function shapeViolations(block: Block): Violation[] {
  const blockReasons = [
    block.name.trim().length === 0 ? EMPTY_NAME : null,
    rangeReason('sessions', block.sessions.length, SESSIONS),
  ].filter((reason): reason is string => reason !== null);

  return [
    ...blockReasons.map((reason) => ({ session: BLOCK_SCOPE, exercise: BLOCK_SCOPE, reason })),
    ...block.sessions
      .filter((session) => session.exercises.length === 0)
      .map((session) => ({ session: session.name, exercise: BLOCK_SCOPE, reason: EMPTY_SESSION })),
  ];
}

export function checkBlock(
  block: Block,
  history: HistorySummary,
  catalogue: TemplateOption[],
): Violation[] {
  const bestWeightByTemplate = new Map<string, number>(
    history.exercises.map((entry) => [entry.templateId, entry.bestWeightKg]),
  );
  const knownTemplateIds = new Set(catalogue.map((template) => template.id));
  const exerciseViolations = block.sessions.flatMap((session) =>
    session.exercises.flatMap((exercise) =>
      findingsFor(exercise, bestWeightByTemplate, knownTemplateIds).map((finding) => ({
        session: session.name,
        exercise: exercise.title,
        ...finding,
      })),
    ),
  );
  return [...shapeViolations(block), ...exerciseViolations];
}

export interface FixedBlock {
  block: Block;
  notes: string[];
}

/** One exercise after its fixes: kept and rewritten, or gone, plus what to tell the athlete. */
interface FixedExercise {
  exercises: Exercise[];
  notes: string[];
}

function isDrop(fix: Fix): fix is { drop: true } {
  return 'drop' in fix;
}

/** A violation names its exercise by session and title, which is how the fix finds it again. */
function fixKey(session: string, exercise: string): string {
  return `${session} / ${exercise}`;
}

function fixesByExercise(violations: Violation[]): Map<string, Fix[]> {
  const fixes = new Map<string, Fix[]>();
  for (const violation of violations) {
    if (!violation.fix) continue;
    const key = fixKey(violation.session, violation.exercise);
    fixes.set(key, [...(fixes.get(key) ?? []), violation.fix]);
  }
  return fixes;
}

function fieldNote(session: string, exercise: Exercise, fix: FieldFix): string {
  const unit = fix.field === 'weightKg' ? KG : '';
  const planned = exercise[fix.field];
  const verb = fix.value < planned ? 'capped at' : 'raised to';
  const change = `${FIELD_LABELS[fix.field]} ${verb} ${fix.value}${unit}`;
  return `${exercise.title} in ${session}: ${change} (planned ${planned}${unit})`;
}

function dropNote(session: string, title: string): string {
  return `Unknown exercise ${title} removed from ${session}`;
}

function fixExercise(exercise: Exercise, session: string, fixes: Fix[]): FixedExercise {
  if (fixes.some(isDrop)) return { exercises: [], notes: [dropNote(session, exercise.title)] };
  const fieldFixes = fixes.filter((fix): fix is FieldFix => !isDrop(fix));
  if (fieldFixes.length === 0) return { exercises: [exercise], notes: [] };
  const fixed = fieldFixes.reduce<Exercise>((current, fix) => ({ ...current, [fix.field]: fix.value }), exercise);
  return { exercises: [fixed], notes: fieldFixes.map((fix) => fieldNote(session, exercise, fix)) };
}

/** The block the guard would have accepted, and what changed. A session left empty by a drop stays a shape violation. */
export function applyFixes(block: Block, violations: Violation[]): FixedBlock {
  const fixes = fixesByExercise(violations);
  const fixed = block.sessions.map((session) => ({
    session,
    exercises: session.exercises.map((exercise) =>
      fixExercise(exercise, session.name, fixes.get(fixKey(session.name, exercise.title)) ?? []),
    ),
  }));

  return {
    block: {
      ...block,
      sessions: fixed.map((entry) => ({
        ...entry.session,
        exercises: entry.exercises.flatMap((result) => result.exercises),
      })),
    },
    notes: fixed.flatMap((entry) => entry.exercises.flatMap((result) => result.notes)),
  };
}
