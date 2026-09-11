import type { Workout, WorkoutExercise } from 'hevy-sdk';
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

export type DayLabel = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

/** One bar of the week volume chart. */
export interface DayVolume {
  day: DayLabel;
  kg: number;
}

export interface WeekVolume {
  totalKg: number;
  sessions: number;
  byDay: DayVolume[];
}

/** One exercise of the last workout, collapsed to the line a card row prints. */
export interface Lift {
  title: string;
  sets: number;
  reps: number;
  weightKg: number;
  volumeKg: number;
}

export interface LastWorkout {
  title: string;
  at: string;
  lifts: Lift[];
}

export interface NextSession {
  name: string;
  exercises: string[];
}

/** The three cards of the carousel. */
export interface CardsView {
  weekVolume: WeekVolume;
  lastWorkout: LastWorkout | null;
  nextSession: NextSession | null;
}

interface Range {
  min: number;
  max: number;
}

/** Eight weeks of training at the highest allowed frequency, so the window is never cut short. */
export const PREFILL_WORKOUTS = 60;
/** The window the cards read: wide enough for this week's volume and for the last routine the athlete ran. */
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

/** Monday first, so the bars read the way the week is lived. */
const DAY_LABELS: readonly DayLabel[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WARMUP_SET = 'warmup';

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

/** Monday is bar 0; `getDay` puts Sunday first, so it shifts to the end. */
const dayIndex = (date: Date): number => (date.getDay() + SUNDAY_SHIFT) % DAYS_PER_WEEK;

/** Most recent Monday at 00:00 in the server's local zone. */
function startOfWeek(now: Date): number {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - dayIndex(monday));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

interface WorkingSet {
  weightKg: number;
  reps: number;
}

/** Warm-ups are not volume, and a set logged without a weight is bodyweight, which Hevy cannot price. */
function workingSets(exercise: WorkoutExercise): WorkingSet[] {
  return exercise.sets
    .filter((set) => set.type !== WARMUP_SET)
    .map((set) => ({ weightKg: set.weight_kg ?? 0, reps: set.reps ?? 0 }));
}

const volumeOf = (sets: WorkingSet[]): number =>
  sets.reduce((total, set) => total + set.weightKg * set.reps, 0);

const workoutVolume = (workout: Workout): number =>
  workout.exercises.reduce((total, exercise) => total + volumeOf(workingSets(exercise)), 0);

function weekVolumeOf(recent: Workout[], now: Date): WeekVolume {
  const weekStart = startOfWeek(now);
  const thisWeek = recent.filter((workout) => startedAt(workout) >= weekStart);
  const kgByDay = new Array<number>(DAYS_PER_WEEK).fill(0);

  for (const workout of thisWeek) {
    kgByDay[dayIndex(new Date(startedAt(workout)))] += workoutVolume(workout);
  }

  return {
    totalKg: Math.round(kgByDay.reduce((total, kg) => total + kg, 0)),
    sessions: thisWeek.length,
    byDay: DAY_LABELS.map((day, index) => ({ day, kg: Math.round(kgByDay[index]) })),
  };
}

/** The reps they actually worked in; a tie goes to the value logged first. */
function commonReps(sets: WorkingSet[]): number {
  const countByReps = new Map<number, number>();
  for (const set of sets) countByReps.set(set.reps, (countByReps.get(set.reps) ?? 0) + 1);

  let common = 0;
  let mostSeen = 0;
  for (const [reps, count] of countByReps) {
    if (count <= mostSeen) continue;
    common = reps;
    mostSeen = count;
  }
  return common;
}

/** Hevy logs an exercise twice when it comes back later in the session; the card shows it once. */
function setsByExercise(workout: Workout): Map<string, WorkingSet[]> {
  const byTitle = new Map<string, WorkingSet[]>();
  for (const exercise of workout.exercises) {
    const sets = [...(byTitle.get(exercise.title) ?? []), ...workingSets(exercise)];
    if (sets.length > 0) byTitle.set(exercise.title, sets);
  }
  return byTitle;
}

function liftOf(title: string, sets: WorkingSet[]): Lift {
  return {
    title,
    sets: sets.length,
    reps: commonReps(sets),
    weightKg: sets.reduce((top, set) => Math.max(top, set.weightKg), 0),
    volumeKg: Math.round(volumeOf(sets)),
  };
}

/** Every lift of the session, heaviest total first; the card shows four, the expanded card all of them. */
function liftsByVolume(workout: Workout): Lift[] {
  return [...setsByExercise(workout)]
    .map(([title, sets]) => liftOf(title, sets))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

function lastWorkoutOf(recent: Workout[]): LastWorkout | null {
  const last = recent[0];
  if (!last) return null;
  return { title: last.title, at: last.start_time, lifts: liftsByVolume(last) };
}

/** By the routine the workout was started from, or by name: Hevy titles a workout after its routine. */
function sessionIndexOf(block: Block, workout: Workout): number {
  return block.sessions.findIndex(
    (session) => (Boolean(workout.routine_id) && session.hevyRoutineId === workout.routine_id) || session.name === workout.title,
  );
}

/** The session after the last one they actually ran; the first session when nothing in the window matches. */
function nextSessionOf(block: Block | null, recent: Workout[]): NextSession | null {
  if (!block || block.sessions.length === 0) return null;
  const ran = recent.map((workout) => sessionIndexOf(block, workout)).find((index) => index >= 0);
  const session = block.sessions[ran === undefined ? 0 : (ran + 1) % block.sessions.length];
  return {
    name: session.name,
    exercises: session.exercises.map((exercise) => exercise.title),
  };
}

/** `recent` comes newest first, as `recentWorkouts` returns it. */
export function cardsView(block: Block | null, recent: Workout[], now: Date): CardsView {
  return {
    weekVolume: weekVolumeOf(recent, now),
    lastWorkout: lastWorkoutOf(recent),
    nextSession: nextSessionOf(block, recent),
  };
}

/** The bubble the thread shows the moment a workout arrives; the app draws the wait for the review under it. */
export function workoutLoggedLine(workout: Workout): string {
  const minutes = Math.round((Date.parse(workout.end_time) - startedAt(workout)) / MS_PER_MINUTE);
  const count = workout.exercises.length;
  const length = Number.isFinite(minutes) && minutes > 0 ? `, ${minutes} min` : '';
  return `**Workout logged**\n- ${workout.title}: ${count} exercise${count === 1 ? '' : 's'}${length}`;
}
