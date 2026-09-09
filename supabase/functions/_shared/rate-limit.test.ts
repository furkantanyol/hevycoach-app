import { assert, assertEquals, assertFalse, assertRejects } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import type { Database, DatabaseResult } from './db.ts';
import { DatabaseUnavailableError } from './db.ts';
import { consumeRateLimit, fixedWindowStart, type RateLimitPolicy } from './rate-limit.ts';

const IDENTITY = 'b'.repeat(64);
const POLICY: RateLimitPolicy = { limit: 3, windowSeconds: 60 };

interface RecordedCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * Stands in for `increment_rate_limit`. The production statement is a single
 * `insert ... on conflict do update ... returning`, so the fake increments and
 * returns in one synchronous step: no interleaving is possible here either.
 */
function countingDatabase(): { database: Database; calls: RecordedCall[] } {
  const counts = new Map<string, number>();
  const calls: RecordedCall[] = [];
  const database: Database = {
    rpc(name, args): Promise<DatabaseResult> {
      calls.push({ name, args });
      const key = JSON.stringify(args);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return Promise.resolve({ data: next, error: null });
    },
  };
  return { database, calls };
}

function failingDatabase(message: string): Database {
  return { rpc: () => Promise.resolve({ data: null, error: { message } }) };
}

describe('fixedWindowStart', () => {
  it('should truncate a time to the start of its window', () => {
    assertEquals(
      fixedWindowStart(new Date('2026-09-09T10:17:43.512Z'), 60).toISOString(),
      '2026-09-09T10:17:00.000Z',
    );
  });

  it('should return the same window start for two times inside one window', () => {
    const first = fixedWindowStart(new Date('2026-09-09T10:17:00.000Z'), 60);
    const last = fixedWindowStart(new Date('2026-09-09T10:17:59.999Z'), 60);
    assertEquals(first.getTime(), last.getTime());
  });

  it('should move to a new window at the boundary instant', () => {
    const before = fixedWindowStart(new Date('2026-09-09T10:17:59.999Z'), 60);
    const after = fixedWindowStart(new Date('2026-09-09T10:18:00.000Z'), 60);
    assert(after.getTime() > before.getTime());
  });
});

describe('consumeRateLimit', () => {
  it('should key the increment on identity, endpoint and window start', async () => {
    const { database, calls } = countingDatabase();
    await consumeRateLimit(database, {
      identityHash: IDENTITY,
      endpoint: 'coach/program',
      policy: POLICY,
      now: new Date('2026-09-09T10:17:43.512Z'),
    });
    assertEquals(calls.length, 1);
    assertEquals(calls[0].name, 'increment_rate_limit');
    assertEquals(calls[0].args, {
      p_identity_hash: IDENTITY,
      p_endpoint: 'coach/program',
      p_window_start: '2026-09-09T10:17:00.000Z',
    });
  });

  it('should allow the request that exactly reaches the limit', async () => {
    const { database } = countingDatabase();
    const now = new Date('2026-09-09T10:17:00.000Z');
    const request = { identityHash: IDENTITY, endpoint: 'coach/program', policy: POLICY, now };

    const decisions = [
      await consumeRateLimit(database, request),
      await consumeRateLimit(database, request),
      await consumeRateLimit(database, request),
    ];

    assertEquals(decisions.map((decision) => decision.allowed), [true, true, true]);
    assertEquals(decisions[2].count, POLICY.limit);
  });

  it('should refuse the request one past the limit', async () => {
    const { database } = countingDatabase();
    const now = new Date('2026-09-09T10:17:00.000Z');
    const request = { identityHash: IDENTITY, endpoint: 'coach/program', policy: POLICY, now };
    for (let attempt = 0; attempt < POLICY.limit; attempt += 1) {
      await consumeRateLimit(database, request);
    }

    const decision = await consumeRateLimit(database, request);

    assertFalse(decision.allowed);
    assertEquals(decision.count, POLICY.limit + 1);
  });

  it('should let only the limit through when requests arrive concurrently', async () => {
    const { database } = countingDatabase();
    const now = new Date('2026-09-09T10:17:00.000Z');
    const request = { identityHash: IDENTITY, endpoint: 'coach/program', policy: POLICY, now };

    const decisions = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(database, request)),
    );

    assertEquals(decisions.filter((decision) => decision.allowed).length, POLICY.limit);
  });

  it('should count each endpoint separately', async () => {
    const { database } = countingDatabase();
    const now = new Date('2026-09-09T10:17:00.000Z');
    await consumeRateLimit(database, {
      identityHash: IDENTITY,
      endpoint: 'coach/program',
      policy: POLICY,
      now,
    });

    const decision = await consumeRateLimit(database, {
      identityHash: IDENTITY,
      endpoint: 'coach/explain',
      policy: POLICY,
      now,
    });

    assertEquals(decision.count, 1);
  });

  it('should start a fresh count in the next window', async () => {
    const { database } = countingDatabase();
    const base = { identityHash: IDENTITY, endpoint: 'coach/program', policy: POLICY };
    await consumeRateLimit(database, { ...base, now: new Date('2026-09-09T10:17:59.999Z') });

    const decision = await consumeRateLimit(database, {
      ...base,
      now: new Date('2026-09-09T10:18:00.000Z'),
    });

    assertEquals(decision.count, 1);
  });

  it('should report the seconds left in the window', async () => {
    const { database } = countingDatabase();
    const decision = await consumeRateLimit(database, {
      identityHash: IDENTITY,
      endpoint: 'coach/program',
      policy: POLICY,
      now: new Date('2026-09-09T10:17:30.000Z'),
    });
    assertEquals(decision.retryAfterSeconds, 30);
  });

  it('should fail closed when the database is unavailable', async () => {
    await assertRejects(
      () =>
        consumeRateLimit(failingDatabase('connection refused'), {
          identityHash: IDENTITY,
          endpoint: 'coach/program',
          policy: POLICY,
          now: new Date('2026-09-09T10:17:00.000Z'),
        }),
      DatabaseUnavailableError,
    );
  });

  it('should fail closed when the count is not a number', async () => {
    const database: Database = { rpc: () => Promise.resolve({ data: 'lots', error: null }) };
    await assertRejects(
      () =>
        consumeRateLimit(database, {
          identityHash: IDENTITY,
          endpoint: 'coach/program',
          policy: POLICY,
          now: new Date('2026-09-09T10:17:00.000Z'),
        }),
      TypeError,
    );
  });
});
