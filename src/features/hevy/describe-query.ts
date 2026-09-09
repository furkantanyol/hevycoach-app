type PendingOrFailed = {
  readonly isPending: boolean;
  readonly error: Error | null;
};

/**
 * What a screen shows where Hevy data would be. The query's own error message is the honest one —
 * a missing API key and an unreachable Hevy read differently and both matter to the user.
 */
export function describeMissingData(query: PendingOrFailed, whenEmpty: string): string {
  if (query.isPending) {
    return 'Loading from Hevy…';
  }
  return query.error?.message ?? whenEmpty;
}
