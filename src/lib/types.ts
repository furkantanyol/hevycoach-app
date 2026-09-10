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
}

/** GET /messages, and every turn POST /messages appends to the thread. */
export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly createdAt: string;
  readonly kind?: 'plan' | 'review';
  readonly choices?: readonly Choice[];
  readonly input?: { readonly kind: 'bodyweight'; readonly unit: 'kg' };
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
