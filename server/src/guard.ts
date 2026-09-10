import type { HistorySummary, TemplateOption } from './hevy.js';
import type { Block, Exercise } from './state.js';

export const MAX_JUMP = 1.15;
export const NO_HISTORY_CAP_KG = 100;
export const REPS = { min: 1, max: 30 } as const;
export const SETS = { min: 1, max: 8 } as const;
export const MIN_WEIGHT_KG = 0;

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

/** `bestWeightKg` is undefined when the template has no history at all, which is not the same as a best of 0 kg. */
function weightCapKg(bestWeightKg: number | undefined): number {
  if (bestWeightKg === undefined) return NO_HISTORY_CAP_KG;
  return Number((MAX_JUMP * bestWeightKg).toFixed(CAP_DECIMAL_PLACES));
}

function weightReason(exercise: Exercise, bestWeightKg: number | undefined): string | null {
  if (exercise.weightKg < MIN_WEIGHT_KG) {
    return `weightKg ${exercise.weightKg} is below the ${MIN_WEIGHT_KG} kg floor`;
  }
  const capKg = weightCapKg(bestWeightKg);
  if (exercise.weightKg <= capKg) return null;
  if (bestWeightKg === undefined) {
    return `weightKg ${exercise.weightKg} is above the ${NO_HISTORY_CAP_KG} kg cap for a template with no history`;
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

export function checkBlock(
  block: Block,
  history: HistorySummary,
  catalogue: TemplateOption[],
): Violation[] {
  const bestWeightByTemplate = new Map<string, number>(
    history.exercises.map((entry) => [entry.templateId, entry.bestWeightKg]),
  );
  const knownTemplateIds = new Set(catalogue.map((template) => template.id));
  return block.sessions.flatMap((session) =>
    session.exercises.flatMap((exercise) =>
      reasonsFor(exercise, bestWeightByTemplate, knownTemplateIds).map((reason) => ({
        session: session.name,
        exercise: exercise.title,
        reason,
      })),
    ),
  );
}
