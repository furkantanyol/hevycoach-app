import type { State } from './state.js';

export const TEXT_MAX_CHARACTERS = 4000;
export const APPLY = 'apply';
const KEEP = 'keep';

interface Delivery {
  id: string;
  workoutId: string;
}

export function messageText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { text } = body as { text?: unknown };
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > TEXT_MAX_CHARACTERS) return null;
  return trimmed;
}

/** An unreadable choice is ignored rather than rejected: the text always carries the same answer. */
export function messageChoice(body: unknown): string | string[] | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { choice } = body as { choice?: unknown };
  if (typeof choice === 'string') return choice;
  if (Array.isArray(choice) && choice.every((entry) => typeof entry === 'string')) return choice;
  return undefined;
}

/** Only a pill tapped on a live proposal writes to Hevy; anything else is an ordinary turn. */
export function proposalChoice(state: State, choice: string | string[] | undefined): string | null {
  if (!state.pendingProposal || typeof choice !== 'string') return null;
  return choice === APPLY || choice === KEEP ? choice : null;
}

export function deviceToken(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { expoPushToken } = body as { expoPushToken?: unknown };
  if (typeof expoPushToken !== 'string' || expoPushToken.length === 0) return null;
  return expoPushToken;
}

/** An object, also when it arrives JSON-encoded inside a string; null for anything else. */
function objectOf(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return objectOf(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

const idOf = (value: unknown): string | null => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null);

/**
 * Hevy delivers `{ "workoutId": "<uuid>" }` and nothing else (docs/hevy-webhook-delivery.md, recorded
 * live 2026-09-11) — no event id, so the workout id is the dedupe key. The documented
 * `{ id, payload: { workoutId } }` and the snake_case and JSON-string variants are still read.
 */
export function deliveryOf(body: unknown): Delivery | null {
  const outer = objectOf(body);
  if (!outer) return null;
  const inner = objectOf(outer.payload) ?? objectOf(outer.data) ?? outer;
  const workoutId = idOf(inner.workoutId) ?? idOf(inner.workout_id);
  if (workoutId === null) return null;
  const id = idOf(outer.id) ?? idOf(outer.eventId) ?? idOf(outer.event_id) ?? workoutId;
  return { id, workoutId };
}
