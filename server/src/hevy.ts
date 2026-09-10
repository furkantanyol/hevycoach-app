import type { ExerciseTemplate, HevyClient, Workout, WorkoutExercise, WorkoutSet } from '@furkantanyol/hevy-client';
import type { Block, Exercise, Session } from './state.js';

export interface ExerciseHistory {
  templateId: string;
  title: string;
  sessions: number;
  lastPerformed: string;
  bestWeightKg: number;
  bestReps: number;
  e1rmTrend: number[];
  weeklyFrequency: number;
}

export interface HistorySummary {
  workouts: number;
  firstWorkout: string | null;
  lastWorkout: string | null;
  latestBodyweightKg: number | null;
  exercises: ExerciseHistory[];
}

export interface TemplateOption {
  id: string;
  title: string;
  muscleGroup: string;
  equipment: string;
}

/** Trims the prompt text only. The summary itself keeps every exercise, so the guard caps on the real best weight. */
export const TOP_EXERCISES = 40;
export const PER_GROUP = 12;
export const ROUTINE_FOLDER = 'HevyCoach';

const EPLEY_DIVISOR = 30;
const TREND_SESSIONS = 3;
const FREQUENCY_WINDOW_DAYS = 28;
const FREQUENCY_WINDOW_WEEKS = 4;
const MS_PER_DAY = 86_400_000;
const TENTH = 10;
const DATE_LENGTH = 10;
const WARMUP_SET = 'warmup';
const UNKNOWN = 'unknown';

interface SetSummary {
  weightKg: number;
  reps: number;
  e1rm: number;
}

interface Totals {
  templateId: string;
  title: string;
  sessions: number;
  lastPerformed: string;
  bestWeightKg: number;
  bestReps: number;
  trend: number[];
  recentSessions: number;
}

const roundToTenth = (value: number): number => Math.round(value * TENTH) / TENTH;

const day = (isoTimestamp: string): string => isoTimestamp.slice(0, DATE_LENGTH);

const heavier = (candidate: SetSummary, best: SetSummary): boolean =>
  candidate.weightKg > best.weightKg ||
  (candidate.weightKg === best.weightKg && candidate.reps > best.reps);

const stronger = (candidate: SetSummary, best: SetSummary): boolean => candidate.e1rm > best.e1rm;

type Comparison = (candidate: SetSummary, best: SetSummary) => boolean;

const pick = (sets: SetSummary[], isBetter: Comparison): SetSummary | null =>
  sets.reduce<SetSummary | null>((best, set) => (best === null || isBetter(set, best) ? set : best), null);

function workingSets(exercise: WorkoutExercise): SetSummary[] {
  const working = exercise.sets.filter((set) => set.type !== WARMUP_SET && (set.reps ?? 0) > 0);
  return working.map((set) => {
    const weightKg = set.weight_kg ?? 0;
    const reps = set.reps ?? 0;
    return { weightKg, reps, e1rm: weightKg * (1 + reps / EPLEY_DIVISOR) };
  });
}

interface Performed {
  exercise: WorkoutExercise;
  startedAt: string;
  isRecent: boolean;
}

function blankTotals(exercise: WorkoutExercise, startedAt: string): Totals {
  const { exercise_template_id: templateId, title } = exercise;
  return { templateId, title, sessions: 0, lastPerformed: startedAt, bestWeightKg: 0, bestReps: 0, trend: [], recentSessions: 0 };
}

function addSession(totalsById: Map<string, Totals>, performed: Performed): void {
  const { exercise, startedAt, isRecent } = performed;
  const totals = totalsById.get(exercise.exercise_template_id) ?? blankTotals(exercise, startedAt);
  const sets = workingSets(exercise);
  const best = pick(sets, heavier);
  const top = pick(sets, stronger);

  totals.title = exercise.title;
  totals.sessions += 1;
  totals.lastPerformed = startedAt;
  if (isRecent) totals.recentSessions += 1;
  if (best && heavier(best, { weightKg: totals.bestWeightKg, reps: totals.bestReps, e1rm: 0 })) {
    totals.bestWeightKg = best.weightKg;
    totals.bestReps = best.reps;
  }
  if (top) totals.trend.push(roundToTenth(top.e1rm));
  totalsById.set(totals.templateId, totals);
}

function rank(totalsById: Map<string, Totals>): ExerciseHistory[] {
  const ordered = [...totalsById.values()].sort(
    (a, b) => b.sessions - a.sessions || Date.parse(b.lastPerformed) - Date.parse(a.lastPerformed),
  );
  return ordered.map(({ trend, recentSessions, ...totals }) => ({
    ...totals,
    e1rmTrend: trend.slice(-TREND_SESSIONS),
    weeklyFrequency: roundToTenth(recentSessions / FREQUENCY_WINDOW_WEEKS),
  }));
}

async function latestBodyweight(client: HevyClient): Promise<number | null> {
  const measurements = await client.bodyMeasurements.listAll();
  const latest = measurements
    .filter((measurement) => typeof measurement.weight_kg === 'number')
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  return latest?.weight_kg ?? null;
}

export async function historySummary(client: HevyClient): Promise<HistorySummary> {
  const workouts = [...(await client.workouts.listAll())].sort(
    (a, b) => Date.parse(a.start_time) - Date.parse(b.start_time),
  );
  const recentSince = Date.now() - FREQUENCY_WINDOW_DAYS * MS_PER_DAY;
  const totalsById = new Map<string, Totals>();

  for (const workout of workouts) {
    const isRecent = Date.parse(workout.start_time) >= recentSince;
    for (const exercise of workout.exercises) {
      addSession(totalsById, { exercise, startedAt: workout.start_time, isRecent });
    }
  }

  return {
    workouts: workouts.length,
    firstWorkout: workouts[0]?.start_time ?? null,
    lastWorkout: workouts.at(-1)?.start_time ?? null,
    latestBodyweightKg: await latestBodyweight(client),
    exercises: rank(totalsById),
  };
}

function exerciseLine(exercise: ExerciseHistory): string {
  const parts = [
    `${exercise.sessions} sessions`,
    `last ${day(exercise.lastPerformed)}`,
    `best ${exercise.bestWeightKg}kg x ${exercise.bestReps}`,
    ...(exercise.e1rmTrend.length > 0 ? [`e1rm ${exercise.e1rmTrend.join(' > ')}`] : []),
    `${exercise.weeklyFrequency}/wk`,
  ];
  return `${exercise.title} [${exercise.templateId}]: ${parts.join(', ')}`;
}

export function formatHistory(summary: HistorySummary): string {
  const span =
    summary.firstWorkout && summary.lastWorkout
      ? `${day(summary.firstWorkout)} to ${day(summary.lastWorkout)}`
      : 'none logged';
  const bodyweight =
    summary.latestBodyweightKg === null ? UNKNOWN : `${summary.latestBodyweightKg} kg`;
  const header = `Workouts: ${summary.workouts} (${span}). Bodyweight: ${bodyweight}.`;
  return [header, ...summary.exercises.slice(0, TOP_EXERCISES).map(exerciseLine)].join('\n');
}

function templateOption(template: ExerciseTemplate): TemplateOption {
  return {
    id: template.id,
    title: template.title,
    muscleGroup: template.primary_muscle_group,
    equipment: template.equipment,
  };
}

function usedOption(used: ExerciseHistory, template: ExerciseTemplate | undefined): TemplateOption {
  if (template) return templateOption(template);
  return { id: used.templateId, title: used.title, muscleGroup: UNKNOWN, equipment: UNKNOWN };
}

export async function templateCatalogue(
  client: HevyClient,
  summary: HistorySummary,
): Promise<TemplateOption[]> {
  const templates = await client.exerciseTemplates.listAll();
  const byId = new Map(templates.map((template) => [template.id, template]));
  const catalogue = summary.exercises.map((used) => usedOption(used, byId.get(used.templateId)));
  const chosen = new Set(catalogue.map((option) => option.id));
  const perGroup = new Map<string, number>();

  for (const template of templates) {
    if (chosen.has(template.id)) continue;
    const group = template.primary_muscle_group;
    const added = perGroup.get(group) ?? 0;
    if (added >= PER_GROUP) continue;
    perGroup.set(group, added + 1);
    catalogue.push(templateOption(template));
  }

  return catalogue;
}

export function formatCatalogue(catalogue: TemplateOption[]): string {
  const byGroup = new Map<string, string[]>();
  for (const option of catalogue) {
    const lines = byGroup.get(option.muscleGroup) ?? [];
    lines.push(`${option.title} [${option.id}] (${option.equipment})`);
    byGroup.set(option.muscleGroup, lines);
  }
  return [...byGroup].map(([group, lines]) => `${group}: ${lines.join('; ')}`).join('\n');
}

function noteFor(exercise: Exercise): string {
  const target = `RPE ${exercise.rpe}`;
  return exercise.note ? `${target}. ${exercise.note}` : target;
}

function toRoutineExercise(exercise: Exercise) {
  return {
    exercise_template_id: exercise.templateId,
    notes: noteFor(exercise),
    sets: Array.from({ length: exercise.sets }, () => ({
      type: 'normal' as const,
      weight_kg: exercise.weightKg,
      reps: exercise.reps,
    })),
  };
}

async function folderId(client: HevyClient): Promise<number> {
  const folders = await client.routineFolders.listAll();
  const existing = folders.find((folder) => folder.title === ROUTINE_FOLDER);
  if (existing) return existing.id;
  const created = await client.routineFolders.create(ROUTINE_FOLDER);
  return created.id;
}

async function writeSession(client: HevyClient, session: Session, folder: number): Promise<Session> {
  const exercises = session.exercises.map(toRoutineExercise);
  const routine = session.hevyRoutineId
    ? await client.routines.update(session.hevyRoutineId, { title: session.name, exercises })
    : await client.routines.create({ title: session.name, folder_id: folder, exercises });
  return { ...session, hevyRoutineId: routine.id };
}

export async function writeRoutines(client: HevyClient, block: Block): Promise<Block> {
  const folder = await folderId(client);
  const sessions: Session[] = [];
  for (const session of block.sessions) {
    sessions.push(await writeSession(client, session, folder));
  }
  return { ...block, sessions };
}

export function findSession(block: Block | null, workout: Workout): Session | null {
  if (!block) return null;
  const byRoutine = workout.routine_id
    ? block.sessions.find((session) => session.hevyRoutineId === workout.routine_id)
    : undefined;
  return byRoutine ?? block.sessions.find((session) => session.name === workout.title) ?? null;
}

function formatSet(set: WorkoutSet): string {
  const rpe = set.rpe === null ? '' : ` @${set.rpe}`;
  return `${set.weight_kg ?? 0}kg x ${set.reps ?? 0}${rpe}`;
}

export function formatWorkout(workout: Workout): string {
  const lines = workout.exercises.map(
    (exercise) => `${exercise.title}: ${exercise.sets.map(formatSet).join(', ')}`,
  );
  return [`${day(workout.start_time)} ${workout.title}`, ...lines].join('\n');
}
