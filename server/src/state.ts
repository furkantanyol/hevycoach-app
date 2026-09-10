import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEXES = ['male', 'female', 'other'] as const;
export const GOALS = ['muscle', 'strength', 'fat_loss', 'longevity', 'athletic'] as const;
export const YEARS_TRAINING = ['<1', '1-3', '3-5', '5+'] as const;
export const EQUIPMENT = ['full_gym', 'home_gym', 'dumbbells', 'bodyweight'] as const;
export const TRAINING_STYLES = ['powerlifting', 'bodybuilding', 'hybrid', 'athletic'] as const;
export const CARDIO = ['none', 'zone2', 'hiit', 'both'] as const;
export const INJURIES = ['knee', 'shoulder', 'lower_back', 'elbow_wrist', 'hip', 'other'] as const;

export type Sex = (typeof SEXES)[number];
export type Goal = (typeof GOALS)[number];
export type YearsTraining = (typeof YEARS_TRAINING)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type TrainingStyle = (typeof TRAINING_STYLES)[number];
export type Cardio = (typeof CARDIO)[number];
export type Injury = (typeof INJURIES)[number];

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  bodyweightKg: number;
  /** At least one, no duplicates: one multi-select in onboarding, so muscle and strength together replace the goal that combined them. */
  goals: Goal[];
  daysPerWeek: number;
  sessionMinutes: number;
  yearsTraining: YearsTraining;
  equipment: Equipment;
  trainingStyle: TrainingStyle;
  cardio: Cardio;
  injuries: Injury[];
  /** Free text for injury detail and anything else the athlete wrote: untrusted. */
  notes: string;
}

/** Every profile field, in onboarding order; the tool schema and the validators read it so the three cannot drift. */
export const PROFILE_KEYS = [
  'sex',
  'age',
  'heightCm',
  'bodyweightKg',
  'goals',
  'daysPerWeek',
  'sessionMinutes',
  'yearsTraining',
  'equipment',
  'trainingStyle',
  'cardio',
  'injuries',
  'notes',
] as const satisfies readonly (keyof Profile)[];

function isOption<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && options.some((option) => option === value);
}

function isOptionList<T extends string>(options: readonly T[], value: unknown): value is T[] {
  return Array.isArray(value) && value.every((entry) => isOption(options, entry));
}

/** Goals are the one list that must hold something, and hold each entry once. */
function isGoalList(value: unknown): value is Goal[] {
  return isOptionList(GOALS, value) && value.length > 0 && new Set(value).size === value.length;
}

/** Shallow: every field present, every union member known. Ranges belong to the route that accepts the profile. */
export function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isOption(SEXES, candidate.sex) &&
    Number.isFinite(candidate.age) &&
    Number.isFinite(candidate.heightCm) &&
    Number.isFinite(candidate.bodyweightKg) &&
    isGoalList(candidate.goals) &&
    Number.isFinite(candidate.daysPerWeek) &&
    Number.isFinite(candidate.sessionMinutes) &&
    isOption(YEARS_TRAINING, candidate.yearsTraining) &&
    isOption(EQUIPMENT, candidate.equipment) &&
    isOption(TRAINING_STYLES, candidate.trainingStyle) &&
    isOption(CARDIO, candidate.cardio) &&
    isOptionList(INJURIES, candidate.injuries) &&
    typeof candidate.notes === 'string'
  );
}

export interface Exercise {
  templateId: string;
  title: string;
  sets: number;
  reps: number;
  weightKg: number;
  rpe: number;
  note: string;
}

export interface Session {
  name: string;
  focus: string;
  hevyRoutineId: string | null;
  exercises: Exercise[];
}

export interface Block {
  name: string;
  weeks: number;
  sessions: Session[];
  createdAt: string;
  reason: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  kind?: 'plan' | 'verdict';
  /** Snapshot of the block this turn wrote; set on plan messages. */
  block?: Block;
  /** Name of the block session the workout matched; set on verdict messages. */
  session?: string;
}

export interface State {
  profile: Profile | null;
  block: Block | null;
  memory: string;
  messages: Message[];
  pushToken: string | null;
  seenEvents: string[];
}

export const DEFAULT_STATE_PATH = fileURLToPath(new URL('../data/state.json', import.meta.url));

const JSON_INDENT = 2;

export function emptyState(): State {
  return {
    profile: null,
    block: null,
    memory: '',
    messages: [],
    pushToken: null,
    seenEvents: [],
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** A profile saved before structured onboarding no longer matches `Profile`; it is dropped so onboarding runs again instead of the server serving a shape nothing can read. */
export async function loadState(path: string = DEFAULT_STATE_PATH): Promise<State> {
  try {
    const saved = JSON.parse(await readFile(path, 'utf8')) as State;
    return { ...saved, profile: isProfile(saved.profile) ? saved.profile : null };
  } catch (error) {
    if (isMissingFile(error)) return emptyState();
    throw error;
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(directory, `.state.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(state, null, JSON_INDENT), 'utf8');
  await rename(temporaryPath, path);
}
