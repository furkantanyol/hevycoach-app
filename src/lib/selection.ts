/**
 * The pills picked on a multi-select question, shared with the composer: the pills write the picked
 * labels into the composer's field, and its send button posts them with their values attached, so
 * there is one way to send. Module level, like reload.ts: pills and composer sit far apart in the
 * tree, and the runtime's composer holds text only.
 */
import { useSyncExternalStore } from 'react';

export interface Selection {
  /** The labels, joined, exactly as written into the composer. */
  readonly text: string;
  readonly values: readonly string[];
}

let selection: Selection | null = null;
const listeners = new Set<() => void>();

export function setSelection(next: Selection | null): void {
  selection = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelection(): Selection | null {
  return useSyncExternalStore(subscribe, () => selection);
}
