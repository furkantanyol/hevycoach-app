import type { Workout } from '@furkantanyol/hevy-client';
import type { ExerciseHistory, HistorySummary } from './hevy.js';
import { CARDIO, EQUIPMENT, GOALS, INJURIES, SEXES, TRAINING_STYLES, YEARS_TRAINING } from './state.js';
import type { Block, Message, Profile } from './state.js';

export interface Prefill {
  bodyweightKg: number | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  yearsTraining: Profile['yearsTraining'] | null;
  equipment: Profile['equipment'] | null;
  workouts: number;
  firstWorkout: string | null;
}

/** `verdict` is the coach's text for that session, null until a verdict message names it. */
export interface Completion {
  completedAt: string;
  verdict: string | null;
}

export interface BlockView {
  block: Block | null;
  nextSessionIndex: number | null;
  completions: Record<number, Completion>;
}

export interface ProgressView {
  workouts: number;
  firstWorkout: string | null;
  lastWorkout: string | null;
  thisWeek: number;
  lifts: ExerciseHistory[];
}

export type ProfileResult = { profile: Profile } | { error: string };

interface Range {
  min: number;
  max: number;
}

/** Eight weeks of training at the highest allowed frequency, so the window is never cut short. */
export const PREFILL_WORKOUTS = 60;
/** The spec's window for /block completions, and wide enough for /progress's week count. */
export const RECENT_WORKOUTS = 30;
export const SUMMARY_TTL_MS = 600_000;
export const NOTES_MAX_CHARACTERS = 1000;

const RANGES: Record<'age' | 'heightCm' | 'bodyweightKg' | 'daysPerWeek' | 'sessionMinutes', Range> = {
  age: { min: 13, max: 100 },
  heightCm: { min: 120, max: 230 },
  bodyweightKg: { min: 30, max: 250 },
  daysPerWeek: { min: 1, max: 7 },
  sessionMinutes: { min: 20, max: 180 },
};

const DURATION_WORKOUTS = 20;
const PREFILL_WEEKS = 8;
const TOP_LIFTS = 15;
const MINUTES_STEP = 15;
const DAYS_PER_WEEK = 7;
const SUNDAY_SHIFT = 6;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_YEAR = 31_557_600_000;
const HALF = 2;

/** Hevy writes the equipment into the template title, e.g. "Bench Press (Barbell)". */
const FULL_GYM_MARKERS = ['barbell', 'machine', 'cable'];
const DUMBBELL_MARKER = 'dumbbell';

const YEAR_BUCKETS: { readonly under: number; readonly label: Profile['yearsTraining'] }[] = [
  { under: 1, label: '<1' },
  { under: 3, label: '1-3' },
  { under: 5, label: '3-5' },
];
const LONGEST_TRAINING: Profile['yearsTraining'] = '5+';

/** Prefills are clamped to the same range PUT /profile accepts, so onboarding never opens on a value it would reject. */
const clamp = (value: number, { min, max }: Range): number => Math.min(Math.max(value, min), max);

const startedAt = (workout: Workout): number => Date.parse(workout.start_time);

const newestFirst = (workouts: Workout[]): Workout[] =>
  [...workouts].sort((a, b) => startedAt(b) - startedAt(a));

function sessionsPerWeek(recent: Workout[], now: number): number | null {
  const since = now - PREFILL_WEEKS * DAYS_PER_WEEK * MS_PER_DAY;
  const sessions = recent.filter((workout) => startedAt(workout) >= since).length;
  if (sessions === 0) return null;
  return clamp(Math.round(sessions / PREFILL_WEEKS), RANGES.daysPerWeek);
}

function medianMinutes(workouts: Workout[]): number | null {
  const durations = workouts
    .map((workout) => (Date.parse(workout.end_time) - startedAt(workout)) / MS_PER_MINUTE)
    .filter((minutes) => minutes > 0)
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  const middle = Math.floor(durations.length / HALF);
  if (durations.length % HALF === 1) return durations[middle];
  return (durations[middle - 1] + durations[middle]) / HALF;
}

function sessionMinutes(recent: Workout[]): number | null {
  const median = medianMinutes(newestFirst(recent).slice(0, DURATION_WORKOUTS));
  if (median === null) return null;
  return clamp(Math.round(median / MINUTES_STEP) * MINUTES_STEP, RANGES.sessionMinutes);
}

function yearsTrainingFrom(firstWorkout: string | null, now: number): Profile['yearsTraining'] | null {
  if (!firstWorkout) return null;
  const years = (now - Date.parse(firstWorkout)) / MS_PER_YEAR;
  return YEAR_BUCKETS.find((bucket) => years < bucket.under)?.label ?? LONGEST_TRAINING;
}

function equipmentFrom(exercises: ExerciseHistory[]): Profile['equipment'] | null {
  if (exercises.length === 0) return null;
  const titles = exercises.map((exercise) => exercise.title.toLowerCase());
  const has = (marker: string): boolean => titles.some((title) => title.includes(marker));
  if (FULL_GYM_MARKERS.some(has)) return 'full_gym';
  if (has(DUMBBELL_MARKER)) return 'dumbbells';
  return 'bodyweight';
}

export function prefillFrom(summary: HistorySummary, recent: Workout[]): Prefill {
  const now = Date.now();
  return {
    bodyweightKg: summary.latestBodyweightKg,
    daysPerWeek: sessionsPerWeek(recent, now),
    sessionMinutes: sessionMinutes(recent),
    yearsTraining: yearsTrainingFrom(summary.firstWorkout, now),
    equipment: equipmentFrom(summary.exercises),
    workouts: summary.workouts,
    firstWorkout: summary.firstWorkout,
  };
}

/** Later messages overwrite earlier ones, so the newest verdict per session name wins. */
function verdictsBySession(messages: Message[]): Map<string, string> {
  const oldestFirst = [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const bySession = new Map<string, string>();
  for (const message of oldestFirst) {
    if (message.kind === 'verdict' && message.session) bySession.set(message.session, message.text);
  }
  return bySession;
}

function sessionIndexOf(block: Block, workout: Workout): number {
  if (!workout.routine_id) return -1;
  return block.sessions.findIndex((session) => session.hevyRoutineId === workout.routine_id);
}

function nextIndexAfter(sessionCount: number, mostRecent: number | null): number {
  if (mostRecent === null || sessionCount === 0) return 0;
  return (mostRecent + 1) % sessionCount;
}

export function blockView(block: Block | null, recent: Workout[], messages: Message[]): BlockView {
  if (!block) return { block: null, nextSessionIndex: null, completions: {} };

  const verdicts = verdictsBySession(messages);
  const completions: Record<number, Completion> = {};
  let mostRecent: number | null = null;

  for (const workout of newestFirst(recent)) {
    const index = sessionIndexOf(block, workout);
    if (index < 0 || index in completions) continue;
    const name = block.sessions[index].name;
    completions[index] = { completedAt: workout.end_time, verdict: verdicts.get(name) ?? null };
    if (mostRecent === null) mostRecent = index;
  }

  return { block, nextSessionIndex: nextIndexAfter(block.sessions.length, mostRecent), completions };
}

/** Most recent Monday at 00:00 in the server's local zone. */
function startOfWeek(now: Date): number {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + SUNDAY_SHIFT) % DAYS_PER_WEEK));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

export function progressView(summary: HistorySummary, recent: Workout[]): ProgressView {
  const weekStart = startOfWeek(new Date());
  return {
    workouts: summary.workouts,
    firstWorkout: summary.firstWorkout,
    lastWorkout: summary.lastWorkout,
    thisWeek: recent.filter((workout) => startedAt(workout) >= weekStart).length,
    lifts: [...summary.exercises].sort((a, b) => b.sessions - a.sessions).slice(0, TOP_LIFTS),
  };
}

/** The clock is injected so a test can move past the window without waiting. */
export function cacheFor<T>(ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  return async () => {
    if (cached && now() < cached.expiresAt) return cached.value;
    const value = await load();
    cached = { value, expiresAt: now() + ttlMs };
    return value;
  };
}

type Check = (value: unknown) => string | null;

const listed = (options: readonly string[]): string => options.join(', ');

const option =
  (options: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && options.includes(value) ? null : `must be one of ${listed(options)}`;

const optionOrNull =
  (options: readonly string[]): Check =>
  (value) => {
    if (value === null) return null;
    return option(options)(value) === null ? null : `must be null or one of ${listed(options)}`;
  };

const range =
  ({ min, max }: Range): Check =>
  (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
      ? null
      : `must be a number between ${min} and ${max}`;

const multiSelect =
  (options: readonly string[]): Check =>
  (value) =>
    Array.isArray(value) && value.every((item: unknown) => typeof item === 'string' && options.includes(item))
      ? null
      : `must be an array of ${listed(options)}`;

const text =
  (max: number): Check =>
  (value) =>
    typeof value === 'string' && value.length <= max ? null : `must be a string of at most ${max} characters`;

/** Keyed by `keyof Profile`, so a new profile field fails the build until it is validated here. */
const CHECKS: Record<keyof Profile, Check> = {
  sex: option(SEXES),
  age: range(RANGES.age),
  heightCm: range(RANGES.heightCm),
  bodyweightKg: range(RANGES.bodyweightKg),
  primaryGoal: option(GOALS),
  secondaryGoal: optionOrNull(GOALS),
  daysPerWeek: range(RANGES.daysPerWeek),
  sessionMinutes: range(RANGES.sessionMinutes),
  yearsTraining: option(YEARS_TRAINING),
  equipment: option(EQUIPMENT),
  trainingStyle: option(TRAINING_STYLES),
  cardio: option(CARDIO),
  injuries: multiSelect(INJURIES),
  notes: text(NOTES_MAX_CHARACTERS),
};

export function validateProfile(body: unknown): ProfileResult {
  if (typeof body !== 'object' || body === null) return { error: 'profile must be an object' };
  const fields = body as Record<string, unknown>;

  // Fail closed on anything extra: an unrejected key would be cast into Profile and persisted verbatim.
  const unknown = Object.keys(fields).find((field) => !Object.hasOwn(CHECKS, field));
  if (unknown) return { error: `${unknown} is not a profile field` };

  for (const [field, check] of Object.entries(CHECKS)) {
    const problem = check(fields[field]);
    if (problem) return { error: `${field} ${problem}` };
  }

  // The body carries exactly the keys of Profile and every one passed its check.
  return { profile: body as Profile };
}
