/**
 * The six intake steps from the Amendment 2026-09-10 in docs/spec.md, and the
 * profile fields each one collects. The onboarding stack renders from this
 * list; the Profile tab uses it in reverse, to send a tapped row back to the
 * step that owns it via `/onboarding?step=N`.
 */
import type { Profile } from './types';

export type ProfileField = keyof Profile;

export interface OnboardingStep {
  /** 1-based, and the value of the `step` search param. */
  readonly step: number;
  readonly title: string;
  /** Empty on the review step, which edits nothing. */
  readonly fields: readonly ProfileField[];
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { step: 1, title: 'About you', fields: ['sex', 'age', 'heightCm'] },
  { step: 2, title: 'Goals', fields: ['goals'] },
  { step: 3, title: 'Training', fields: ['daysPerWeek', 'sessionMinutes', 'yearsTraining'] },
  { step: 4, title: 'Equipment and style', fields: ['equipment', 'trainingStyle', 'cardio'] },
  { step: 5, title: 'Body and limits', fields: ['bodyweightKg', 'injuries', 'notes'] },
  { step: 6, title: 'Review and build', fields: [] },
];

export const FIRST_STEP = 1;
export const REVIEW_STEP = ONBOARDING_STEPS.length;

/** Which step edits a field. Falls back to the first step, never out of range. */
export function stepForField(field: ProfileField): number {
  const owner = ONBOARDING_STEPS.find((step) => step.fields.includes(field));
  return owner ? owner.step : FIRST_STEP;
}

/**
 * A `step` search param is untrusted text: anything unreadable or out of range
 * starts the flow at the beginning.
 */
export function parseStep(raw: unknown): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== 'string') return FIRST_STEP;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed)) return FIRST_STEP;
  if (parsed < FIRST_STEP || parsed > REVIEW_STEP) return FIRST_STEP;
  return parsed;
}
