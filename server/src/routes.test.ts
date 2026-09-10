import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from '@furkantanyol/hevy-client';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CoachDeps } from './coach.js';
import { buildApp, type RouteDeps, SEEN_EVENTS_MAX } from './routes.js';
import { emptyState, type Message, type State } from './state.js';

process.env.LOG_LEVEL = 'silent';

const APP_TOKEN = 'app-token';
const WEBHOOK_SECRET = 'webhook-secret';
const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_CONFIGURED = 503;
const TEXT_MAX_CHARACTERS = 4000;
const PUSH_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
const MESSAGES = '/messages';
const DEVICE = '/device';
const WEBHOOK = '/webhook/hevy';
const FIRST_DELIVERY = 'first hevy delivery';
const TURN_COMPLETED = 'chat turn completed';
const REDACTED = '[redacted]';

type Headers = Record<string, string>;

const appAuth: Headers = { authorization: `Bearer ${APP_TOKEN}` };
const hookAuth: Headers = { authorization: `Bearer ${WEBHOOK_SECRET}` };
const delivery = (id: string) => ({ id, payload: { workoutId: 'w-1' } });

const get = (app: FastifyInstance, url: string, headers?: Headers) =>
  app.inject({ method: 'GET', url, headers });
const post = (app: FastifyInstance, url: string, payload: object, headers?: Headers) =>
  app.inject({ method: 'POST', url, payload, headers });

const offline: typeof fetch = async () => {
  throw new Error('the coach must not reach the network in these tests');
};

function coachDeps(state: State): CoachDeps {
  return {
    anthropic: new Anthropic({ apiKey: 'test', fetch: offline, maxRetries: 0 }),
    hevy: createHevyClient({ apiKey: 'test', fetch: offline, retries: 0 }),
    state,
    save: async () => {},
    models: { plan: 'plan-model', chat: 'chat-model' },
    log: () => {},
  };
}

function harness(overrides: Partial<RouteDeps> = {}, seed: Partial<State> = {}) {
  const state: State = { ...emptyState(), ...seed };
  let saves = 0;
  const deps: RouteDeps = {
    state,
    save: async () => {
      saves += 1;
    },
    coach: coachDeps(state),
    appToken: APP_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    pushToken: () => state.pushToken,
    judge: async () => null,
    ...overrides,
  };
  return { app: buildApp(deps), state, saves: () => saves };
}

function captureLogger(records: unknown[][]): FastifyBaseLogger {
  const log = (...args: unknown[]): void => {
    records.push(args);
  };
  const logger: FastifyBaseLogger = { level: 'info', fatal: log, error: log, warn: log, info: log, debug: log, trace: log, silent: log, child: () => logger };
  return logger;
}

function firstDeliveryLog(records: unknown[][]): { headers: Record<string, string> } | undefined {
  const entry = records.find((args) => args[1] === FIRST_DELIVERY);
  return entry?.[0] as { headers: Record<string, string> } | undefined;
}

function turnLog(records: unknown[][]): [unknown, unknown] | undefined {
  const entry = records.find((args) => String(args[1]).startsWith('chat turn'));
  return entry as [unknown, unknown] | undefined;
}

const message: Message = {
  id: 'm1',
  role: 'assistant',
  text: 'Solid session.',
  createdAt: '2026-09-10T10:00:00.000Z',
  kind: 'verdict',
};

describe('GET /health', () => {
  it('should answer without a token', async () => {
    const { app } = harness();

    expect((await get(app, '/health')).json()).toEqual({ ok: true });
  });
});

describe('the app token hook', () => {
  it('should reject an app route carrying the wrong token', async () => {
    const { app } = harness();

    const response = await get(app, MESSAGES, { authorization: 'Bearer wrong' });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it('should reject an app route carrying no token at all', async () => {
    const { app } = harness();

    expect((await get(app, MESSAGES)).statusCode).toBe(UNAUTHORIZED);
  });

  it('should reject an app route sending the token without the Bearer prefix', async () => {
    const { app } = harness();

    expect((await get(app, MESSAGES, { authorization: APP_TOKEN })).statusCode).toBe(UNAUTHORIZED);
  });

  it('should report not configured when APP_TOKEN is unset', async () => {
    const { app } = harness({ appToken: undefined });

    expect((await get(app, MESSAGES, appAuth)).statusCode).toBe(NOT_CONFIGURED);
  });
});

describe('GET /messages', () => {
  it('should return the messages held in state', async () => {
    const { app } = harness({}, { messages: [message] });

    expect((await get(app, MESSAGES, appAuth)).json()).toEqual([message]);
  });
});

describe('POST /messages', () => {
  it('should reject an empty text', async () => {
    const { app } = harness();

    expect((await post(app, MESSAGES, { text: '   ' }, appAuth)).statusCode).toBe(BAD_REQUEST);
  });

  it('should reject a text over the character limit', async () => {
    const { app } = harness();
    const text = 'a'.repeat(TEXT_MAX_CHARACTERS + 1);

    expect((await post(app, MESSAGES, { text }, appAuth)).statusCode).toBe(BAD_REQUEST);
  });

  it('should stream every chunk the turn writes', async () => {
    const turn: RouteDeps['turn'] = async (_deps, text, write) => {
      write(`heard ${text}`);
      write('. Pull day next.');
    };
    const { app } = harness({ turn });

    const response = await post(app, MESSAGES, { text: 'four days a week' }, appAuth);

    expect(response.body).toBe('heard four days a week. Pull day next.');
  });

  it('should send the streamed reply as plain text', async () => {
    const turn: RouteDeps['turn'] = async (_deps, _text, write) => write('ok');
    const { app } = harness({ turn });

    const response = await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('should log how long the turn took and whether it wrote a plan', async () => {
    const records: unknown[][] = [];
    const turn: RouteDeps['turn'] = async (coach) => {
      coach.state.messages.push({ ...message, kind: 'plan' });
    };
    const { app } = harness({ turn, logger: captureLogger(records) });

    await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(turnLog(records)).toEqual([{ ms: expect.any(Number), planned: true }, TURN_COMPLETED]);
  });

  it('should log the failure with the error message when the turn throws', async () => {
    const records: unknown[][] = [];
    const turn: RouteDeps['turn'] = async () => {
      throw new Error('anthropic is down');
    };
    const { app } = harness({ turn, logger: captureLogger(records) });

    await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(turnLog(records)?.[1]).toBe('chat turn failed: anthropic is down');
  });

  it('should append the coach error to the stream when the turn throws', async () => {
    const turn: RouteDeps['turn'] = async (_deps, _text, write) => {
      write('thinking');
      throw new Error('anthropic is down');
    };
    const { app } = harness({ turn });

    const response = await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(response.body).toBe('thinking\n[coach error] anthropic is down');
  });
});

describe('POST /device', () => {
  it('should store the expo push token in state', async () => {
    const { app, state } = harness();

    await post(app, DEVICE, { expoPushToken: PUSH_TOKEN }, appAuth);

    expect(state.pushToken).toBe(PUSH_TOKEN);
  });

  it('should save the state and answer 204', async () => {
    const { app, saves } = harness();

    const response = await post(app, DEVICE, { expoPushToken: PUSH_TOKEN }, appAuth);

    expect([response.statusCode, saves()]).toEqual([NO_CONTENT, 1]);
  });

  it('should reject a body without an expoPushToken', async () => {
    const { app } = harness();

    expect((await post(app, DEVICE, {}, appAuth)).statusCode).toBe(BAD_REQUEST);
  });
});

describe('POST /webhook/hevy', () => {
  it('should report not configured when WEBHOOK_SECRET is unset', async () => {
    const { app } = harness({ webhookSecret: undefined });

    const response = await post(app, WEBHOOK, delivery('e-1'), hookAuth);

    expect(response.statusCode).toBe(NOT_CONFIGURED);
  });

  it('should reject a delivery carrying the wrong secret', async () => {
    const { app } = harness();

    const response = await post(app, WEBHOOK, delivery('e-1'), { authorization: 'Bearer nope' });

    expect(response.statusCode).toBe(UNAUTHORIZED);
  });

  it('should reject a delivery carrying no authorization header', async () => {
    const { app } = harness();

    expect((await post(app, WEBHOOK, delivery('e-1'))).statusCode).toBe(UNAUTHORIZED);
  });

  it('should accept the secret without the Bearer prefix', async () => {
    const { app } = harness();

    const response = await post(app, WEBHOOK, delivery('e-1'), { authorization: WEBHOOK_SECRET });

    expect(response.statusCode).toBe(OK);
  });

  it('should reject a body that is not { id, payload: { workoutId } }', async () => {
    const { app } = harness();

    const response = await post(app, WEBHOOK, { id: 'e-1', payload: {} }, hookAuth);

    expect(response.statusCode).toBe(BAD_REQUEST);
  });

  it('should record a delivery it has never seen', async () => {
    const { app } = harness();

    const response = await post(app, WEBHOOK, delivery('e-1'), hookAuth);

    expect(response.json()).toEqual({ recorded: true, notified: false });
  });

  it('should add the event id to seenEvents', async () => {
    const { app, state } = harness({}, { seenEvents: ['e-0'] });

    await post(app, WEBHOOK, delivery('e-1'), hookAuth);

    expect(state.seenEvents).toEqual(['e-0', 'e-1']);
  });

  it('should not record a replayed delivery', async () => {
    const { app } = harness({}, { seenEvents: ['e-1'] });

    const response = await post(app, WEBHOOK, delivery('e-1'), hookAuth);

    expect(response.json()).toEqual({ recorded: false, notified: false });
  });

  it('should not save the state again for a replayed delivery', async () => {
    const { app, saves } = harness({}, { seenEvents: ['e-1'] });

    await post(app, WEBHOOK, delivery('e-1'), hookAuth);

    expect(saves()).toBe(0);
  });

  it('should log the first delivery with the authorization header redacted', async () => {
    const records: unknown[][] = [];
    const { app } = harness({ logger: captureLogger(records) });

    await post(app, WEBHOOK, delivery('e-1'), hookAuth);

    expect(firstDeliveryLog(records)?.headers.authorization).toBe(REDACTED);
  });

  it('should drop the oldest event id once seenEvents is full', async () => {
    const seenEvents = Array.from({ length: SEEN_EVENTS_MAX }, (_, index) => `e-${index}`);
    const { app, state } = harness({}, { seenEvents });

    await post(app, WEBHOOK, delivery('e-new'), hookAuth);

    expect([state.seenEvents.length, state.seenEvents[0], state.seenEvents.at(-1)]).toEqual([
      SEEN_EVENTS_MAX,
      'e-1',
      'e-new',
    ]);
  });
});
