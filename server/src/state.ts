import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOALS = ['muscle', 'strength', 'fat_loss', 'longevity', 'athletic'] as const;
export const YEARS_TRAINING = ['<1', '1-3', '3-5', '5+'] as const;
export const EQUIPMENT = ['full_gym', 'home_gym', 'dumbbells', 'bodyweight'] as const;
export const INJURIES = ['knee', 'shoulder', 'lower_back', 'elbow_wrist', 'hip', 'other'] as const;

export type Goal = (typeof GOALS)[number];
export type YearsTraining = (typeof YEARS_TRAINING)[number];
export type Equipment = (typeof EQUIPMENT)[number];
export type Injury = (typeof INJURIES)[number];

/** The scripted intake asks for the first five fields; the last three come from the Hevy history. */
export interface Profile {
  /** At least one, no duplicates. */
  goals: Goal[];
  daysPerWeek: number;
  bodyweightKg: number;
  injuries: Injury[];
  /** Free text the athlete wrote: untrusted. */
  notes: string;
  equipment: Equipment;
  sessionMinutes: number;
  yearsTraining: YearsTraining;
}

/** Every profile field, in intake order; the tool schema reads it so the two cannot drift. */
export const PROFILE_KEYS = [
  'goals',
  'daysPerWeek',
  'bodyweightKg',
  'injuries',
  'notes',
  'equipment',
  'sessionMinutes',
  'yearsTraining',
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

/** Shallow: every field present, every union member known. Ranges belong to the intake that fills it. */
export function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isGoalList(candidate.goals) &&
    Number.isFinite(candidate.daysPerWeek) &&
    Number.isFinite(candidate.bodyweightKg) &&
    isOptionList(INJURIES, candidate.injuries) &&
    typeof candidate.notes === 'string' &&
    isOption(EQUIPMENT, candidate.equipment) &&
    Number.isFinite(candidate.sessionMinutes) &&
    isOption(YEARS_TRAINING, candidate.yearsTraining)
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

/** One pill under the last coach message: the label is shown, the value is sent back. An exclusive pill answers a multi-select question by itself. */
export interface Choice {
  label: string;
  value: string;
  exclusive?: true;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  /** `logged`: the workout has arrived and its review is being written; the app shows the wait under it. */
  kind?: 'plan' | 'review' | 'logged';
  choices?: Choice[];
  /** The pills toggle and one "Done" sends them together, so the choice comes back as a list. */
  multi?: true;
  /** Snapshot of the block this turn wrote; set on plan messages. */
  block?: Block;
  /** Name of the block session the workout matched; set on review messages. */
  session?: string;
}

/** Exported like the other option lists: the app labels a step, and the type is derived from it. */
export const INTAKE_STEPS = [
  'journey',
  'yearsTraining',
  'daysPerWeek',
  'equipment',
  'goals',
  'injuries',
  'bodyweight',
  'bodyweightValue',
  'notes',
] as const;

export type IntakeStep = (typeof INTAKE_STEPS)[number];

const isIntakeStep = (value: unknown): value is IntakeStep => INTAKE_STEPS.some((step) => step === value);

/** An intake saved while waiting on a step that no longer exists would throw on every reply; it is dropped instead. */
const currentIntake = (intake: IntakeState | null | undefined): IntakeState | null =>
  intake && isIntakeStep(intake.step) ? intake : null;

/**
 * The history picks the script: fewer than ten logged workouts run the new-to-Hevy branch, which asks
 * what the history cannot answer. With a history the opener asks one question instead — a fresh block
 * (existing) or a block that continues the routines they already run (continue), which asks least.
 */
export const INTAKE_PATHS = ['existing', 'new', 'continue'] as const;

export type IntakePath = (typeof INTAKE_PATHS)[number];

/** The scripted intake in flight: the question waiting for an answer, and what has been answered. */
export interface IntakeState {
  step: IntakeStep;
  answers: Partial<Profile>;
  /** Which branch is running; absent in a script saved before the branch existed, read as the existing path. */
  path?: IntakePath;
}

/** A change the coach proposed after a workout; nothing reaches Hevy until the athlete accepts it. */
export interface PendingProposal {
  sessionIndex: number;
  exercises: Exercise[];
  messageId: string;
}

export interface State {
  profile: Profile | null;
  block: Block | null;
  memory: string;
  messages: Message[];
  pushToken: string | null;
  seenEvents: string[];
  intake: IntakeState | null;
  pendingProposal: PendingProposal | null;
}

export const DEFAULT_STATE_PATH = fileURLToPath(new URL('../data/state.json', import.meta.url));

const JSON_INDENT = 2;
/** What a review message was called before the one-screen amendment. */
const OLD_REVIEW_KIND = 'verdict';

export function emptyState(): State {
  return {
    profile: null,
    block: null,
    memory: '',
    messages: [],
    pushToken: null,
    seenEvents: [],
    intake: null,
    pendingProposal: null,
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function asReview(message: Message): Message {
  const kind: string | undefined = message.kind;
  if (kind !== OLD_REVIEW_KIND) return message;
  return { ...message, kind: 'review' };
}

/**
 * A profile saved before the reduced shape no longer matches `Profile`, so it is dropped and intake
 * runs again instead of the server serving a shape nothing can read. Fields added after a save load as null.
 */
export async function loadState(path: string = DEFAULT_STATE_PATH): Promise<State> {
  try {
    const saved = JSON.parse(await readFile(path, 'utf8')) as State;
    return {
      ...emptyState(),
      ...saved,
      profile: isProfile(saved.profile) ? saved.profile : null,
      messages: (saved.messages ?? []).map(asReview),
      intake: currentIntake(saved.intake),
      pendingProposal: saved.pendingProposal ?? null,
    };
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
