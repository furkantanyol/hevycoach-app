/**
 * The wire shapes of the coach server, copied from the Amendment 2026-09-10
 * table in docs/spec.md. The app stores nothing, so these are read shapes:
 * everything here arrives from the server and is rendered, never cached.
 */

export type Goal = 'muscle' | 'strength' | 'fat_loss' | 'longevity' | 'athletic';

export type Injury = 'knee' | 'shoulder' | 'lower_back' | 'elbow_wrist' | 'hip' | 'other';

export interface Profile {
  sex: 'male' | 'female' | 'other';
  age: number;
  heightCm: number;
  bodyweightKg: number;
  /** At least one, no duplicates: one multi-select in onboarding. */
  goals: Goal[];
  daysPerWeek: number;
  sessionMinutes: number;
  yearsTraining: '<1' | '1-3' | '3-5' | '5+';
  equipment: 'full_gym' | 'home_gym' | 'dumbbells' | 'bodyweight';
  trainingStyle: 'powerlifting' | 'bodybuilding' | 'hybrid' | 'athletic';
  cardio: 'none' | 'zone2' | 'hiit' | 'both';
  injuries: Injury[];
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
  createdAt: string;
  reason: string;
  sessions: Session[];
}

/** GET /profile */
export interface ProfileResponse {
  profile: Profile | null;
}

/** GET /prefill — every field is null when the history cannot answer it. */
export interface PrefillResponse {
  bodyweightKg: number | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  yearsTraining: Profile['yearsTraining'] | null;
  equipment: Profile['equipment'] | null;
  workouts: number;
  firstWorkout: string | null;
}

/** `verdict` is the coach's text for that session, null until a verdict names it. */
export interface Completion {
  completedAt: string;
  verdict: string | null;
}

/** GET /block — `completions` is keyed by session index, as a string over the wire. */
export interface BlockResponse {
  block: Block | null;
  nextSessionIndex: number | null;
  completions: Record<string, Completion>;
}

export interface Lift {
  templateId: string;
  title: string;
  sessions: number;
  lastPerformed: string;
  bestWeightKg: number;
  bestReps: number;
  e1rmTrend: number[];
  weeklyFrequency: number;
}

/** GET /progress */
export interface ProgressResponse {
  workouts: number;
  firstWorkout: string | null;
  lastWorkout: string | null;
  thisWeek: number;
  lifts: Lift[];
}
