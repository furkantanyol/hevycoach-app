import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Profile {
  goal: string;
  daysPerWeek: number;
  experience: string;
  equipment: string;
  constraints: string;
  notes: string;
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

export async function loadState(path: string = DEFAULT_STATE_PATH): Promise<State> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as State;
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
