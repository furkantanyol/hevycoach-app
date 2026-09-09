const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 5 * 60 * 1_000;

/** After this many failures a row stops being retried and is reported as dead. */
export const MAX_ATTEMPTS = 8;

/**
 * Exponential backoff from one second, capped at five minutes, with full jitter so a queue that
 * built up while offline does not stampede Hevy the moment the network returns. At MAX_ATTEMPTS
 * the ladder tops out at ~2 minutes, so the cap only binds if the attempt budget ever grows.
 */
export function nextAttemptDelayMs(attempts: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);

  return Math.floor(Math.random() * ceiling);
}
