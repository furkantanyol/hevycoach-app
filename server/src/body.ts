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

export function deliveryOf(body: unknown): Delivery | null {
  if (typeof body !== 'object' || body === null) return null;
  const { id, payload } = body as { id?: unknown; payload?: unknown };
  if (typeof id !== 'string' || typeof payload !== 'object' || payload === null) return null;
  const { workoutId } = payload as { workoutId?: unknown };
  if (typeof workoutId !== 'string') return null;
  return { id, workoutId };
}
