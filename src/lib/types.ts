/**
 * The wire shapes of the coach server, from the "Amendment 2026-09-10 21:00:
 * carousel, native components, structured chat, intake branch" section of
 * docs/spec.md. The app stores nothing, so these are read shapes: everything
 * here arrives from the server and is rendered, never cached.
 */

/** One pill under an assistant message: what it says, what it sends back. */
export interface Choice {
  readonly label: string;
  readonly value: string;
  /** Answers a multi-select question by itself: tapping it sends at once. */
  readonly exclusive?: true;
}

/** GET /messages, and every turn POST /messages appends to the thread. */
export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly createdAt: string;
  readonly kind?: 'plan' | 'review' | 'logged';
  readonly choices?: readonly Choice[];
  /** Pills toggle and "Done" sends them together as one list. */
  readonly multi?: true;
  readonly block?: PlanBlock;
}

/** One day's working-set volume: one Mon–Sun bar of the volume card's chart. */
export interface DayVolume {
  readonly day: string;
  readonly kg: number;
}

/** One exercise of the last workout, already grouped and ordered by the server. */
export interface Lift {
  readonly title: string;
  readonly sets: number;
  readonly reps: number;
  readonly weightKg: number;
  readonly volumeKg: number;
}

/** One exercise of a written session, as the server planned and Hevy now holds it. */
export interface PlanExercise {
  readonly title: string;
  readonly sets: number;
  readonly reps: number;
  readonly weightKg: number;
  readonly rpe: number;
}

export interface PlanSession {
  readonly name: string;
  readonly focus: string;
  readonly exercises: readonly PlanExercise[];
}

/** The block a plan message wrote into Hevy; the session cards under the message draw it. */
export interface PlanBlock {
  readonly name: string;
  readonly weeks: number;
  readonly sessions: readonly PlanSession[];
}

/** GET /cards — everything the three carousel cards draw, in one read. */
export interface CardsView {
  readonly weekVolume: {
    readonly totalKg: number;
    readonly sessions: number;
    readonly byDay: readonly DayVolume[];
  };
  readonly lastWorkout: {
    readonly title: string;
    readonly at: string;
    readonly lifts: readonly Lift[];
  } | null;
  readonly nextSession: {
    readonly name: string;
    readonly exercises: readonly string[];
  } | null;
}
