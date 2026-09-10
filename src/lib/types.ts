/**
 * The wire shapes of the coach server, from the "Amendment 2026-09-10 18:00:
 * one screen, final" section of docs/spec.md. The app stores nothing, so these
 * are read shapes: everything here arrives from the server and is rendered,
 * never cached.
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
  readonly multi?: boolean;
}

/** GET /week — the one grey line under the title. */
export interface WeekView {
  readonly workoutsThisWeek: number;
  readonly lastWorkout: { readonly title: string; readonly at: string } | null;
  readonly nextSession: string | null;
}
