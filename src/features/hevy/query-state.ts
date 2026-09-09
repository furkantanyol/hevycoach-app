/** The shape of a React Query result this app cares about, so callers can pass any query. */
type ObservedQuery = {
  readonly isPending: boolean;
  readonly fetchStatus: 'fetching' | 'paused' | 'idle';
  readonly error: Error | null;
};

export type QueryState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'offline'; readonly hasRows: boolean }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty' };

/**
 * The four states this app is actually in, from one query and whether it produced anything.
 *
 * `networkMode: 'offlineFirst'` pauses retries rather than failing them when the device is offline,
 * so a paused fetch — not an error — is what being offline looks like. A paused fetch on top of a
 * warm persisted cache still has rows, and those rows are the answer: the screen renders them and
 * only says it is offline.
 */
export function queryState(query: ObservedQuery, hasRows: boolean): QueryState {
  if (query.fetchStatus === 'paused') {
    return { kind: 'offline', hasRows };
  }
  if (query.error !== null) {
    return { kind: 'error', message: query.error.message };
  }
  if (query.isPending) {
    return { kind: 'loading' };
  }
  return hasRows ? { kind: 'ready' } : { kind: 'empty' };
}

const LOADING = 'Loading from Hevy…';
const OFFLINE_WITH_ROWS = 'Offline — showing what was last read from Hevy.';
const OFFLINE_COLD = 'Offline, and nothing has been read from Hevy yet. This fills in on reconnect.';

/** What to put on screen, or null when the data itself is the answer. */
export function describeQueryState(state: QueryState, whenEmpty: string): string | null {
  switch (state.kind) {
    case 'ready':
      return null;
    case 'loading':
      return LOADING;
    case 'offline':
      return state.hasRows ? OFFLINE_WITH_ROWS : OFFLINE_COLD;
    case 'error':
      return state.message;
    case 'empty':
      return whenEmpty;
  }
}
