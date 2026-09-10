import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from '@furkantanyol/hevy-client';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CoachDeps, Review } from './coach.js';
import { buildApp, type RouteDeps, SEEN_EVENTS_MAX } from './routes.js';
import { emptyState, type Message, type State } from './state.js';

process.env.LOG_LEVEL = 'silent';

const APP_TOKEN = 'app-token';
const WEBHOOK_SECRET = 'webhook-secret';
const OK = 200;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_CONFIGURED = 503;
const WEBHOOK = '/webhook/hevy';
const FIRST_DELIVERY = 'first hevy delivery';
const REDACTED = '[redacted]';
const PUSH_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
const PUSH_TITLE = 'Review of your workout is ready';
const REVIEW_HEADLINE = 'Squat moved for all three sets.';
const SESSION_NAME = 'Lower A';

type Headers = Record<string, string>;

const hookAuth: Headers = { authorization: `Bearer ${WEBHOOK_SECRET}` };
const delivery = (id: string) => ({ id, payload: { workoutId: 'w-1' } });

const post = (app: FastifyInstance, url: string, payload: object, headers?: Headers) =>
  app.inject({ method: 'POST', url, payload, headers });

const offline: typeof fetch = async () => {
  throw new Error('the coach must not reach the network in these tests');
};

function coachDeps(state: State, hevy: typeof fetch): CoachDeps {
  return {
    anthropic: new Anthropic({ apiKey: 'test', fetch: offline, maxRetries: 0 }),
    hevy: createHevyClient({ apiKey: 'test', fetch: hevy, retries: 0 }),
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
    coach: coachDeps(state, offline),
    appToken: APP_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    pushToken: () => state.pushToken,
    handlers: { review: async () => null },
    ...overrides,
  };
  return { app: buildApp(deps), state, saves: () => saves };
}

interface PushCall {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

const REVIEWED: Review = {
  message: { id: 'm-1', role: 'assistant', text: `${REVIEW_HEADLINE}\nSame load next week.`, createdAt: '2026-09-10T10:00:00.000Z', kind: 'review' } satisfies Message,
  pushBody: REVIEW_HEADLINE,
  sessionName: SESSION_NAME,
};

/** A delivery that reaches the push: the review is written, a device is registered, and the push is captured. */
function pushHarness() {
  const pushes: PushCall[] = [];
  let landed: () => void = () => {};
  const pushed = new Promise<void>((resolve) => {
    landed = resolve;
  });
  const { app } = harness({
    pushToken: () => PUSH_TOKEN,
    handlers: {
      review: async () => REVIEWED,
      push: async (token, title, body, data) => {
        pushes.push({ token, title, body, data });
        landed();
        return { sent: true };
      },
    },
  });
  return { app, pushes, pushed };
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

  it('should push the review under the title the app shows', async () => {
    const { app, pushes, pushed } = pushHarness();

    await post(app, WEBHOOK, delivery('e-1'), hookAuth);
    await pushed;

    expect(pushes[0]?.title).toBe(PUSH_TITLE);
  });

  it('should send the first line of the review as the push body', async () => {
    const { app, pushes, pushed } = pushHarness();

    await post(app, WEBHOOK, delivery('e-1'), hookAuth);
    await pushed;

    expect(pushes[0]).toMatchObject({ token: PUSH_TOKEN, body: REVIEW_HEADLINE, data: { url: '/' } });
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
