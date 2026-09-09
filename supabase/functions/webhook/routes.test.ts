import { assert, assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import type { Database, DatabaseResult } from '../_shared/db.ts';
import { IDENTITY_HEADER } from '../_shared/identity.ts';
import type { FetchLike } from '../_shared/push.ts';
import {
  handleWebhookRequest,
  shouldRegenerate,
  type WebhookDependencies,
} from './routes.ts';

const SECRET = 'hevy-webhook-secret';
const IDENTITY = 'e'.repeat(64);
const EVENT = { id: 'evt-1', payload: { workoutId: 'wk-1' } };

interface RecordedCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

function recordingDatabase(): { database: Database; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const seen = new Set<string>();
  const database: Database = {
    rpc(name, args): Promise<DatabaseResult> {
      calls.push({ name, args });
      if (name === 'record_webhook_event') {
        const id = String(args.p_id);
        const isNew = !seen.has(id);
        seen.add(id);
        return Promise.resolve({ data: isNew, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { database, calls };
}

function failingFetch(): FetchLike {
  return () => {
    throw new Error('the webhook must not send a push while Phase D is open');
  };
}

function dependencies(database: Database): WebhookDependencies {
  return {
    database,
    fetchImpl: failingFetch(),
    now: () => new Date('2026-09-09T18:00:00.000Z'),
    webhookSecret: SECRET,
  };
}

function webhookRequest(
  options: {
    readonly token?: string;
    readonly body?: unknown;
    readonly path?: string;
    readonly method?: string;
    readonly identity?: string;
  } = {},
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.token !== undefined) {
    headers.set('authorization', `Bearer ${options.token}`);
  }
  if (options.identity !== undefined) {
    headers.set(IDENTITY_HEADER, options.identity);
  }
  const method = options.method ?? 'POST';
  return new Request(`https://edge.test${options.path ?? '/webhook/hevy'}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? EVENT),
  });
}

describe('handleWebhookRequest authentication', () => {
  it('should accept the configured shared secret', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET }),
      dependencies(database),
    );
    assertEquals(response.status, 200);
  });

  it('should reject a wrong secret of the same length', async () => {
    const { database, calls } = recordingDatabase();
    const wrong = `${SECRET.slice(0, -1)}X`;

    const response = await handleWebhookRequest(
      webhookRequest({ token: wrong }),
      dependencies(database),
    );

    assertEquals(response.status, 401);
    assertEquals(calls.length, 0);
  });

  it('should reject a secret of a different length rather than throwing', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: 'x' }),
      dependencies(database),
    );
    assertEquals(response.status, 401);
  });

  it('should reject a prefix of the real secret', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET.slice(0, 5) }),
      dependencies(database),
    );
    assertEquals(response.status, 401);
  });

  it('should reject a request with no authorization header', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(webhookRequest(), dependencies(database));
    assertEquals(response.status, 401);
  });

  it('should reject a token sent without the bearer scheme', async () => {
    const { database } = recordingDatabase();
    const request = new Request('https://edge.test/webhook/hevy', {
      method: 'POST',
      headers: { authorization: SECRET },
      body: JSON.stringify(EVENT),
    });
    const response = await handleWebhookRequest(request, dependencies(database));
    assertEquals(response.status, 401);
  });

  it('should refuse to serve when no secret is configured', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET }),
      { ...dependencies(database), webhookSecret: undefined },
    );
    assertEquals(response.status, 503);
  });

  it('should never echo the secret back to the caller', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: 'guess' }),
      dependencies(database),
    );
    assertEquals((await response.text()).includes(SECRET), false);
  });
});

describe('handleWebhookRequest routing and body', () => {
  it('should return 404 for another path', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET, path: '/webhook/other' }),
      dependencies(database),
    );
    assertEquals(response.status, 404);
  });

  it('should refuse a GET', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET, method: 'GET' }),
      dependencies(database),
    );
    assertEquals(response.status, 405);
  });

  it('should reject a body with no workout id', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET, body: { id: 'evt-1', payload: {} } }),
      dependencies(database),
    );
    assertEquals(response.status, 400);
  });
});

describe('handleWebhookRequest recording', () => {
  it('should record the event id and workout id', async () => {
    const { database, calls } = recordingDatabase();
    await handleWebhookRequest(webhookRequest({ token: SECRET }), dependencies(database));

    assertEquals(calls[0].name, 'record_webhook_event');
    assertEquals(calls[0].args, { p_id: 'evt-1', p_workout_id: 'wk-1' });
  });

  it('should report a replayed event as already recorded', async () => {
    const { database } = recordingDatabase();
    const dependency = dependencies(database);
    await handleWebhookRequest(webhookRequest({ token: SECRET }), dependency);

    const response = await handleWebhookRequest(webhookRequest({ token: SECRET }), dependency);

    assertEquals(await response.json(), { recorded: false, notified: false });
  });
});

describe('shouldRegenerate', () => {
  it('should return false while the progression spec is still open', async () => {
    assertEquals(await shouldRegenerate({ id: 'evt-1', workoutId: 'wk-1' }), false);
  });

  it('should keep the webhook from sending a push', async () => {
    const { database } = recordingDatabase();
    const response = await handleWebhookRequest(
      webhookRequest({ token: SECRET, identity: IDENTITY }),
      dependencies(database),
    );

    assertEquals(response.status, 200);
    assert((await response.json()).notified === false);
  });
});
