import type { Workout } from '@furkantanyol/hevy-client';
import type { ExerciseHistory, HistorySummary } from './hevy.js';
import type { Block, Profile } from './state.js';

/** What the history answers on its own, so intake never asks for it. Each field is null when Hevy has no evidence. */
export interface Prefill {
  bodyweightKg: number | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  yearsTraining: Profile['yearsTraining'] | null;
  equipment: Profile['equipment'] | null;
  workouts: number;
  firstWorkout: string | null;
}

export interface WeekView {
  workoutsThisWeek: number;
  lastWorkout: { title: string; at: string } | null;
  nextSession: string | null;
}

interface Range {
  min: number;
  max: number;
}

/** Eight weeks of training at the highest allowed frequency, so the window is never cut short. */
export const PREFILL_WORKOUTS = 60;
/** The window /week reads: wide enough for this week's count and for the last routine the athlete ran. */
export const RECENT_WORKOUTS = 30;

const DAYS_PER_WEEK_RANGE: Range = { min: 1, max: 7 };
const SESSION_MINUTES_RANGE: Range = { min: 20, max: 180 };

const DURATION_WORKOUTS = 20;
const PREFILL_WEEKS = 8;
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

/** Prefills are clamped to what the profile accepts, so a wild history never becomes a wild default. */
const clamp = (value: number, { min, max }: Range): number => Math.min(Math.max(value, min), max);

const startedAt = (workout: Workout): number => Date.parse(workout.start_time);

const newestFirst = (workouts: Workout[]): Workout[] =>
  [...workouts].sort((a, b) => startedAt(b) - startedAt(a));

function sessionsPerWeek(recent: Workout[], now: number): number | null {
  const since = now - PREFILL_WEEKS * DAYS_PER_WEEK * MS_PER_DAY;
  const sessions = recent.filter((workout) => startedAt(workout) >= since).length;
  if (sessions === 0) return null;
  return clamp(Math.round(sessions / PREFILL_WEEKS), DAYS_PER_WEEK_RANGE);
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
  return clamp(Math.round(median / MINUTES_STEP) * MINUTES_STEP, SESSION_MINUTES_RANGE);
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

/** Most recent Monday at 00:00 in the server's local zone. */
function startOfWeek(now: Date): number {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + SUNDAY_SHIFT) % DAYS_PER_WEEK));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

function sessionIndexOf(block: Block, workout: Workout): number {
  if (!workout.routine_id) return -1;
  return block.sessions.findIndex((session) => session.hevyRoutineId === workout.routine_id);
}

/** The session after the last one they actually ran; the first session when nothing in the window matches. */
function nextSessionName(block: Block | null, recent: Workout[]): string | null {
  if (!block || block.sessions.length === 0) return null;
  const ran = recent.map((workout) => sessionIndexOf(block, workout)).find((index) => index >= 0);
  const next = ran === undefined ? 0 : (ran + 1) % block.sessions.length;
  return block.sessions[next].name;
}

/** `recent` comes newest first, as `recentWorkouts` returns it. */
export function weekView(block: Block | null, recent: Workout[], now: Date = new Date()): WeekView {
  const weekStart = startOfWeek(now);
  const last = recent[0];
  return {
    workoutsThisWeek: recent.filter((workout) => startedAt(workout) >= weekStart).length,
    lastWorkout: last ? { title: last.title, at: last.start_time } : null,
    nextSession: nextSessionName(block, recent),
  };
}
