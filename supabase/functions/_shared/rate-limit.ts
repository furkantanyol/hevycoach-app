import { callDatabase, type Database } from './db.ts';

/**
 * Per-identity, per-endpoint fixed-window rate limiting, held in the Postgres
 * we already run rather than in a second service.
 *
 * The increment is one atomic `insert ... on conflict do update ... returning`
 * inside a Postgres function, so two concurrent requests cannot both read the
 * same count and both decide they are under the limit.
 */

const MILLISECONDS_PER_SECOND = 1_000;

export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitRequest {
  readonly identityHash: string;
  readonly endpoint: string;
  readonly policy: RateLimitPolicy;
  readonly now: Date;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly count: number;
  readonly limit: number;
  readonly retryAfterSeconds: number;
}

export function fixedWindowStart(now: Date, windowSeconds: number): Date {
  const windowMilliseconds = windowSeconds * MILLISECONDS_PER_SECOND;
  return new Date(Math.floor(now.getTime() / windowMilliseconds) * windowMilliseconds);
}

export async function consumeRateLimit(
  database: Database,
  request: RateLimitRequest,
): Promise<RateLimitDecision> {
  const { identityHash, endpoint, policy, now } = request;
  const windowStart = fixedWindowStart(now, policy.windowSeconds);
  const count = await callDatabase(database, 'increment_rate_limit', {
    p_identity_hash: identityHash,
    p_endpoint: endpoint,
    p_window_start: windowStart.toISOString(),
  });
  if (typeof count !== 'number') {
    throw new TypeError('increment_rate_limit did not return a count');
  }
  const windowEnd = windowStart.getTime() + policy.windowSeconds * MILLISECONDS_PER_SECOND;
  return {
    allowed: count <= policy.limit,
    count,
    limit: policy.limit,
    retryAfterSeconds: Math.ceil((windowEnd - now.getTime()) / MILLISECONDS_PER_SECOND),
  };
}
