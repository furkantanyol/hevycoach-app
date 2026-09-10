import type { HistorySummary, TemplateOption } from './hevy.js';
import type { Block, Exercise } from './state.js';

export const MAX_JUMP = 1.15;
export const NO_HISTORY_CAP_KG = 100;
export const REPS = { min: 1, max: 30 } as const;
export const SETS = { min: 1, max: 8 } as const;
export const MIN_WEIGHT_KG = 0;
export const MIN_SESSIONS = 2;
export const MAX_SESSIONS = 6;

export interface Violation {
  session: string;
  exercise: string;
  reason: string;
}

interface Range {
  min: number;
  max: number;
}

const CAP_DECIMAL_PLACES = 2;
const SESSIONS: Range = { min: MIN_SESSIONS, max: MAX_SESSIONS };
/** Block-level violations have no exercise to name, so they carry this in place of one; the review filters on it. */
export const BLOCK_SCOPE = 'block';
const EMPTY_NAME = 'the block name is empty';
const EMPTY_SESSION = 'the session has no exercises';

/** Cables and bodyweight movements are logged at 0 kg, so a best of 0 is no weight evidence, not a 0 kg ceiling. */
function hasWeightEvidence(bestWeightKg: number | undefined): bestWeightKg is number {
  return bestWeightKg !== undefined && bestWeightKg > 0;
}

function weightCapKg(bestWeightKg: number | undefined): number {
  if (!hasWeightEvidence(bestWeightKg)) return NO_HISTORY_CAP_KG;
  return Number((MAX_JUMP * bestWeightKg).toFixed(CAP_DECIMAL_PLACES));
}

function weightReason(exercise: Exercise, bestWeightKg: number | undefined): string | null {
  if (exercise.weightKg < MIN_WEIGHT_KG) {
    return `weightKg ${exercise.weightKg} is below the ${MIN_WEIGHT_KG} kg floor`;
  }
  const capKg = weightCapKg(bestWeightKg);
  if (exercise.weightKg <= capKg) return null;
  if (!hasWeightEvidence(bestWeightKg)) {
    return `weightKg ${exercise.weightKg} is above the ${NO_HISTORY_CAP_KG} kg cap for a template with no logged weight`;
  }
  return `weightKg ${exercise.weightKg} is above the ${capKg} kg cap (${MAX_JUMP} x best logged ${bestWeightKg} kg)`;
}

function rangeReason(label: string, value: number, range: Range): string | null {
  if (value >= range.min && value <= range.max) return null;
  return `${label} ${value} is outside ${range.min}-${range.max}`;
}

function catalogueReason(exercise: Exercise, knownTemplateIds: Set<string>): string | null {
  if (knownTemplateIds.has(exercise.templateId)) return null;
  return `templateId ${exercise.templateId} is not in the catalogue`;
}

function reasonsFor(
  exercise: Exercise,
  bestWeightByTemplate: Map<string, number>,
  knownTemplateIds: Set<string>,
): string[] {
  const reasons = [
    catalogueReason(exercise, knownTemplateIds),
    weightReason(exercise, bestWeightByTemplate.get(exercise.templateId)),
    rangeReason('reps', exercise.reps, REPS),
    rangeReason('sets', exercise.sets, SETS),
  ];
  return reasons.filter((reason): reason is string => reason !== null);
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
      reasonsFor(exercise, bestWeightByTemplate, knownTemplateIds).map((reason) => ({
        session: session.name,
        exercise: exercise.title,
        reason,
      })),
    ),
  );
  return [...shapeViolations(block), ...exerciseViolations];
}
