import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import type { Database, DatabaseResult } from './db.ts';
import {
  EXPO_PUSH_ENDPOINT,
  type FetchLike,
  MAX_NOTIFICATIONS_PER_WINDOW,
  type PushDependencies,
  rollingWindowStart,
  sendCappedPush,
} from './push.ts';

const IDENTITY = 'c'.repeat(64);
const NOW = new Date('2026-09-09T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1_000;

interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

/**
 * Stands in for the two Postgres functions the push path calls. The slot claim
 * mirrors the SQL: it counts rows at or after the supplied cutoff and inserts
 * only while that count is under the cap.
 */
function fakeDatabase(
  options: { readonly token: string | null; readonly sentAt?: readonly Date[] },
): Database {
  const sent = [...(options.sentAt ?? [])];
  return {
    rpc(name, args): Promise<DatabaseResult> {
      if (name === 'push_token_for_identity') {
        return Promise.resolve({ data: options.token, error: null });
      }
      if (name === 'claim_notification_slot') {
        const since = new Date(String(args.p_since)).getTime();
        const inWindow = sent.filter((at) => at.getTime() >= since).length;
        const claimed = inWindow < Number(args.p_max);
        if (claimed) {
          sent.push(NOW);
        }
        return Promise.resolve({ data: claimed, error: null });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

/** Expo answers a single message with a single ticket object, not an array. */
function recordingFetch(
  body: unknown = { data: { status: 'ok', id: 'ticket-1' } },
  status = 200,
): { fetchImpl: FetchLike; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetchImpl, requests };
}

function dependencies(
  database: Database,
  fetchImpl: FetchLike,
  accessToken?: string,
): PushDependencies {
  return { database, fetchImpl, now: NOW, accessToken };
}

const MESSAGE = {
  identityHash: IDENTITY,
  kind: 'weekly-regeneration',
  title: 'Next week is ready',
  body: 'Your block moved on.',
  data: { screen: 'week-review' },
};

describe('rollingWindowStart', () => {
  it('should sit exactly seven days behind now', () => {
    assertEquals(rollingWindowStart(NOW).toISOString(), '2026-09-02T12:00:00.000Z');
  });
});

describe('sendCappedPush', () => {
  it('should post the Expo message shape to the send endpoint', async () => {
    const { fetchImpl, requests } = recordingFetch();
    const outcome = await sendCappedPush(
      MESSAGE,
      dependencies(fakeDatabase({ token: 'ExponentPushToken[abc]' }), fetchImpl),
    );

    assertEquals(outcome, { sent: true, ticketId: 'ticket-1' });
    assertEquals(requests.length, 1);
    assertEquals(requests[0].url, EXPO_PUSH_ENDPOINT);
    assertEquals(requests[0].init.method, 'POST');
    assertEquals(requests[0].init.headers, {
      accept: 'application/json',
      'content-type': 'application/json',
    });
    assertEquals(JSON.parse(String(requests[0].init.body)), {
      to: 'ExponentPushToken[abc]',
      title: 'Next week is ready',
      body: 'Your block moved on.',
      data: { screen: 'week-review' },
    });
  });

  it('should attach a bearer token when one is configured', async () => {
    const { fetchImpl, requests } = recordingFetch();
    await sendCappedPush(
      MESSAGE,
      dependencies(fakeDatabase({ token: 'ExponentPushToken[abc]' }), fetchImpl, 'expo-secret'),
    );
    assertEquals(
      (requests[0].init.headers as Record<string, string>).authorization,
      'Bearer expo-secret',
    );
  });

  it('should not send when the identity has no registered token', async () => {
    const { fetchImpl, requests } = recordingFetch();
    const outcome = await sendCappedPush(
      MESSAGE,
      dependencies(fakeDatabase({ token: null }), fetchImpl),
    );

    assertEquals(outcome, { sent: false, reason: 'no-token' });
    assertEquals(requests.length, 0);
  });

  it('should send the second notification of the window', async () => {
    const { fetchImpl, requests } = recordingFetch();
    const database = fakeDatabase({
      token: 'ExponentPushToken[abc]',
      sentAt: [new Date(NOW.getTime() - DAY_MS)],
    });

    const outcome = await sendCappedPush(MESSAGE, dependencies(database, fetchImpl));

    assertEquals(outcome.sent, true);
    assertEquals(requests.length, 1);
  });

  it('should refuse a third notification inside the window without calling Expo', async () => {
    const { fetchImpl, requests } = recordingFetch();
    const database = fakeDatabase({
      token: 'ExponentPushToken[abc]',
      sentAt: [new Date(NOW.getTime() - DAY_MS), new Date(NOW.getTime() - 2 * DAY_MS)],
    });

    const outcome = await sendCappedPush(MESSAGE, dependencies(database, fetchImpl));

    assertEquals(outcome, { sent: false, reason: 'capped' });
    assertEquals(requests.length, 0);
  });

  it('should still count a notification sent exactly at the window edge', async () => {
    const { fetchImpl } = recordingFetch();
    const database = fakeDatabase({
      token: 'ExponentPushToken[abc]',
      sentAt: [rollingWindowStart(NOW), new Date(NOW.getTime() - DAY_MS)],
    });

    const outcome = await sendCappedPush(MESSAGE, dependencies(database, fetchImpl));

    assertEquals(outcome, { sent: false, reason: 'capped' });
  });

  it('should let a notification one millisecond older than the window fall out', async () => {
    const { fetchImpl } = recordingFetch();
    const database = fakeDatabase({
      token: 'ExponentPushToken[abc]',
      sentAt: [
        new Date(rollingWindowStart(NOW).getTime() - 1),
        new Date(NOW.getTime() - DAY_MS),
      ],
    });

    const outcome = await sendCappedPush(MESSAGE, dependencies(database, fetchImpl));

    assertEquals(outcome.sent, true);
  });

  it('should cap at two notifications per rolling week', async () => {
    const { fetchImpl, requests } = recordingFetch();
    const database = fakeDatabase({ token: 'ExponentPushToken[abc]' });
    const send = () => sendCappedPush(MESSAGE, dependencies(database, fetchImpl));

    const outcomes = [await send(), await send(), await send()];

    assertEquals(outcomes.map((outcome) => outcome.sent), [true, true, false]);
    assertEquals(requests.length, MAX_NOTIFICATIONS_PER_WINDOW);
  });

  it('should read the ticket id out of an array of tickets too', async () => {
    const { fetchImpl } = recordingFetch({ data: [{ status: 'ok', id: 'ticket-2' }] });

    const outcome = await sendCappedPush(
      MESSAGE,
      dependencies(fakeDatabase({ token: 'ExponentPushToken[abc]' }), fetchImpl),
    );

    assertEquals(outcome, { sent: true, ticketId: 'ticket-2' });
  });

  it('should report a rejection from Expo rather than throwing', async () => {
    const { fetchImpl } = recordingFetch({ errors: [{ code: 'INTERNAL_SERVER_ERROR' }] }, 500);

    const outcome = await sendCappedPush(
      MESSAGE,
      dependencies(fakeDatabase({ token: 'ExponentPushToken[abc]' }), fetchImpl),
    );

    assertEquals(outcome, { sent: false, reason: 'rejected' });
  });

  it('should report a rejection when the send never reaches Expo', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error('network down'));

    const outcome = await sendCappedPush(
      MESSAGE,
      dependencies(fakeDatabase({ token: 'ExponentPushToken[abc]' }), fetchImpl),
    );

    assertEquals(outcome, { sent: false, reason: 'rejected' });
  });
});
