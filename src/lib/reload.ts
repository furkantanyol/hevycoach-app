/**
 * One counter, one subscriber list — the mechanism a notification tap uses to
 * reach the thread.
 *
 * The app is a single screen, so a tap has nowhere to navigate: the root
 * layout calls `bumpReload()` instead, the screen reads the counter with
 * `useReloadCount()` and keys the runtime on it. `useLocalRuntime` loads
 * history once and the local runtime reports `refetchThread: false`, so a
 * fresh key is what makes the history adapter's `load()` run again.
 *
 * Module level, not context: the observer lives above the screen and outside
 * React's tree on a cold start (`getLastNotificationResponse` is read in an
 * effect before the screen has mounted), and `useSyncExternalStore` gives the
 * screen a tear-free read of a value that changes outside its render.
 */
import { useSyncExternalStore } from 'react';

type Listener = () => void;

const listeners = new Set<Listener>();
let reloadCount = 0;

/** Ask the thread to remount and read the server's history again. */
export function bumpReload(): void {
  reloadCount += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return reloadCount;
}

export function useReloadCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
