/**
 * The intake draft: one frozen object at module scope, a set of subscribers,
 * and `useSyncExternalStore`. The app stores nothing (docs/spec.md), so this
 * lives only for one pass through the six steps and is thrown away once
 * PUT /profile has taken it — no library, no persistence, no context.
 */
import { useSyncExternalStore } from 'react';

import { ONBOARDING_STEPS, type ProfileField } from './onboarding-steps';
import type { Goal, Injury, PrefillResponse, Profile } from './types';

/**
 * Numbers are held as the raw text of their input so a field can be empty
 * while it is being retyped; everything else is the profile value, or null for
 * "not answered yet". `injuries` is the one field whose empty answer is a real
 * answer, so the flow never blocks on it.
 */
export interface Draft {
  readonly sex: Profile['sex'] | null;
  readonly age: string;
  readonly heightCm: string;
  readonly bodyweightKg: string;
  readonly goals: readonly Goal[];
  readonly daysPerWeek: number | null;
  readonly sessionMinutes: number | null;
  readonly yearsTraining: Profile['yearsTraining'] | null;
  readonly equipment: Profile['equipment'] | null;
  readonly trainingStyle: Profile['trainingStyle'] | null;
  readonly cardio: Profile['cardio'] | null;
  readonly injuries: readonly Injury[];
  readonly notes: string;
}

interface Range {
  readonly min: number;
  readonly max: number;
}

/** The server's own bounds (server/src/derived.ts), so Continue and PUT agree. */
const RANGES: Readonly<Record<'age' | 'heightCm' | 'bodyweightKg', Range>> = {
  age: { min: 13, max: 100 },
  heightCm: { min: 120, max: 230 },
  bodyweightKg: { min: 30, max: 250 },
};

export const NOTES_MAX_CHARACTERS = 1000;

/** The five fields GET /prefill can answer from the Hevy history. */
const PREFILLED_FIELDS = [
  'bodyweightKg',
  'daysPerWeek',
  'sessionMinutes',
  'yearsTraining',
  'equipment',
] as const;

const EMPTY_DRAFT: Draft = {
  sex: null,
  age: '',
  heightCm: '',
  bodyweightKg: '',
  goals: [],
  daysPerWeek: null,
  sessionMinutes: null,
  yearsTraining: null,
  equipment: null,
  trainingStyle: null,
  cardio: null,
  injuries: [],
  notes: '',
};

const NO_FIELDS: ReadonlySet<ProfileField> = new Set();

let draft: Draft = EMPTY_DRAFT;
let fromHevy: ReadonlySet<ProfileField> = NO_FIELDS;
const listeners = new Set<() => void>();

function publish(nextDraft: Draft, nextFromHevy: ReadonlySet<ProfileField>): void {
  draft = nextDraft;
  fromHevy = nextFromHevy;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const readDraft = (): Draft => draft;
const readFromHevy = (): ReadonlySet<ProfileField> => fromHevy;

export function useDraft(): Draft {
  return useSyncExternalStore(subscribe, readDraft);
}

/** The fields still showing the value GET /prefill guessed, for the caption. */
export function usePrefilledFields(): ReadonlySet<ProfileField> {
  return useSyncExternalStore(subscribe, readFromHevy);
}

function without(
  fields: ReadonlySet<ProfileField>,
  removed: readonly ProfileField[],
): ReadonlySet<ProfileField> {
  const remaining = new Set(fields);
  for (const field of removed) remaining.delete(field);
  return remaining;
}

/**
 * Any answer the user gives is their own, so it loses the Hevy caption. The set
 * keeps its identity when nothing was a guess, which is every keystroke in a
 * field the history could not answer.
 */
export function updateDraft(patch: Partial<Draft>): void {
  const touched = Object.keys(patch) as ProfileField[];
  const guessed = touched.some((field) => fromHevy.has(field));
  publish({ ...draft, ...patch }, guessed ? without(fromHevy, touched) : fromHevy);
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

function draftFromProfile(profile: Profile): Draft {
  return {
    sex: profile.sex,
    age: String(profile.age),
    heightCm: String(profile.heightCm),
    bodyweightKg: String(profile.bodyweightKg),
    goals: profile.goals,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    yearsTraining: profile.yearsTraining,
    equipment: profile.equipment,
    trainingStyle: profile.trainingStyle,
    cardio: profile.cardio,
    injuries: profile.injuries,
    notes: profile.notes,
  };
}

function draftFromPrefill(prefill: PrefillResponse): Draft {
  return {
    ...EMPTY_DRAFT,
    bodyweightKg: numberText(prefill.bodyweightKg),
    daysPerWeek: prefill.daysPerWeek,
    sessionMinutes: prefill.sessionMinutes,
    yearsTraining: prefill.yearsTraining,
    equipment: prefill.equipment,
  };
}

function answeredByHevy(prefill: PrefillResponse): ReadonlySet<ProfileField> {
  const answered = new Set<ProfileField>();
  for (const field of PREFILLED_FIELDS) {
    if (prefill[field] !== null) answered.add(field);
  }
  return answered;
}

/**
 * A profile that already exists wins outright: it is the user's own answers,
 * and none of it is a guess, so no field carries the Hevy caption. Only a
 * first pass falls back to what the history could work out.
 */
export function seedDraft(profile: Profile | null, prefill: PrefillResponse | null): void {
  if (profile) {
    publish(draftFromProfile(profile), NO_FIELDS);
    return;
  }
  if (!prefill) {
    publish(EMPTY_DRAFT, NO_FIELDS);
    return;
  }
  publish(draftFromPrefill(prefill), answeredByHevy(prefill));
}

/** A comma is what an iOS numeric keypad gives in most of Europe. */
function boundedNumber(text: string, range: Range): number | null {
  if (text.trim() === '') return null;
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  if (value < range.min || value > range.max) return null;
  return value;
}

type FieldCheck = (current: Draft) => boolean;

/** Keyed by `keyof Profile`, so a new profile field fails the build until it is answered here. */
const ANSWERED: Readonly<Record<ProfileField, FieldCheck>> = {
  sex: (current) => current.sex !== null,
  age: (current) => boundedNumber(current.age, RANGES.age) !== null,
  heightCm: (current) => boundedNumber(current.heightCm, RANGES.heightCm) !== null,
  bodyweightKg: (current) => boundedNumber(current.bodyweightKg, RANGES.bodyweightKg) !== null,
  goals: (current) => current.goals.length > 0,
  daysPerWeek: (current) => current.daysPerWeek !== null,
  sessionMinutes: (current) => current.sessionMinutes !== null,
  yearsTraining: (current) => current.yearsTraining !== null,
  equipment: (current) => current.equipment !== null,
  trainingStyle: (current) => current.trainingStyle !== null,
  cardio: (current) => current.cardio !== null,
  injuries: () => true,
  notes: (current) => current.notes.length <= NOTES_MAX_CHARACTERS,
};

/** What Continue reads: every field this step owns has an answer. */
export function isStepComplete(current: Draft, step: number): boolean {
  const owner = ONBOARDING_STEPS.find((candidate) => candidate.step === step);
  if (!owner) return false;
  return owner.fields.every((field) => ANSWERED[field](current));
}

/** The draft as the server wants it, or null while an answer is still missing. */
export function draftProfile(current: Draft): Profile | null {
  const age = boundedNumber(current.age, RANGES.age);
  const heightCm = boundedNumber(current.heightCm, RANGES.heightCm);
  const bodyweightKg = boundedNumber(current.bodyweightKg, RANGES.bodyweightKg);
  if (age === null || heightCm === null || bodyweightKg === null) return null;
  if (current.sex === null || current.goals.length === 0) return null;
  if (current.daysPerWeek === null || current.sessionMinutes === null) return null;
  if (current.yearsTraining === null || current.equipment === null) return null;
  if (current.trainingStyle === null || current.cardio === null) return null;
  if (current.notes.length > NOTES_MAX_CHARACTERS) return null;

  return {
    sex: current.sex,
    age,
    heightCm,
    bodyweightKg,
    goals: [...current.goals],
    daysPerWeek: current.daysPerWeek,
    sessionMinutes: current.sessionMinutes,
    yearsTraining: current.yearsTraining,
    equipment: current.equipment,
    trainingStyle: current.trainingStyle,
    cardio: current.cardio,
    injuries: [...current.injuries],
    notes: current.notes,
  };
}
