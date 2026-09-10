import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from '@furkantanyol/hevy-client';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CoachDeps } from './coach.js';
import { buildApp, type Handlers, type RouteDeps } from './routes.js';
import { emptyState, type Message, type State } from './state.js';
import { newMessage } from './thread.js';

process.env.LOG_LEVEL = 'silent';

const APP_TOKEN = 'app-token';
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const NOT_CONFIGURED = 503;
const TEXT_MAX_CHARACTERS = 4000;
const PUSH_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
const MESSAGES = '/messages';
const DEVICE = '/device';
const TURN_COMPLETED = 'chat turn completed';
const APPLIED = 'Updated Day 2 - Heavy Upper in Hevy.';
const KEPT = 'Kept as is.';

type Headers = Record<string, string>;

const appAuth: Headers = { authorization: `Bearer ${APP_TOKEN}` };

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
    pushToken: () => state.pushToken,
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

function turnLog(records: unknown[][]): [unknown, unknown] | undefined {
  const entry = records.find((args) => String(args[1]).startsWith('chat turn'));
  return entry as [unknown, unknown] | undefined;
}

const message: Message = {
  id: 'm1',
  role: 'assistant',
  text: 'Solid session.',
  createdAt: '2026-09-10T10:00:00.000Z',
  kind: 'review',
};

const pendingProposal = { sessionIndex: 1, exercises: [], messageId: 'm1' };
const intake = { step: 'goals', answers: {} } as const;

/** Stands in for the scripted intake: it appends the coach's next question the way the real one does. */
const intakeReply: Partial<Handlers> = {
  intakeReply: async (deps, text) => {
    deps.state.messages.push(newMessage('user', text));
    deps.state.messages.push(newMessage('assistant', 'How many days a week?'));
  },
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

describe('the routes the one-screen amendment deleted', () => {
  it.each(['/profile', '/prefill', '/block', '/progress'])('should not serve %s', async (path) => {
    const { app } = harness();

    expect((await get(app, path, appAuth)).statusCode).toBe(NOT_FOUND);
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
    const turn: Handlers['turn'] = async (_deps, text, write) => {
      write(`heard ${text}`);
      write('. Pull day next.');
    };
    const { app } = harness({ handlers: { turn } });

    const response = await post(app, MESSAGES, { text: 'four days a week' }, appAuth);

    expect(response.body).toBe('heard four days a week. Pull day next.');
  });

  it('should send the streamed reply as plain text', async () => {
    const { app } = harness({ handlers: { turn: async (_deps, _text, write) => write('ok') } });

    const response = await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('should log how long the turn took and whether it wrote a plan', async () => {
    const records: unknown[][] = [];
    const turn: Handlers['turn'] = async (coach) => {
      coach.state.messages.push({ ...message, kind: 'plan' });
    };
    const { app } = harness({ handlers: { turn }, logger: captureLogger(records) });

    await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(turnLog(records)).toEqual([{ ms: expect.any(Number), planned: true }, TURN_COMPLETED]);
  });

  it('should log the failure with the error message when the turn throws', async () => {
    const records: unknown[][] = [];
    const turn: Handlers['turn'] = async () => {
      throw new Error('anthropic is down');
    };
    const { app } = harness({ handlers: { turn }, logger: captureLogger(records) });

    await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(turnLog(records)?.[1]).toBe('chat turn failed: anthropic is down');
  });

  it('should append the coach error to the stream when the turn throws', async () => {
    const turn: Handlers['turn'] = async (_deps, _text, write) => {
      write('thinking');
      throw new Error('anthropic is down');
    };
    const { app } = harness({ handlers: { turn } });

    const response = await post(app, MESSAGES, { text: 'hi' }, appAuth);

    expect(response.body).toBe('thinking\n[coach error] anthropic is down');
  });
});

describe('POST /messages during intake', () => {
  it('should stream the question the script appended', async () => {
    const { app } = harness({ handlers: intakeReply }, { intake });

    const response = await post(app, MESSAGES, { text: 'Muscle', choice: ['muscle'] }, appAuth);

    expect(response.body).toBe('How many days a week?');
  });

  it('should route a typed reply to the script rather than the chat turn', async () => {
    const turn: Handlers['turn'] = async (_deps, _text, write) => write('chat');
    const { app } = harness({ handlers: { ...intakeReply, turn } }, { intake });

    const response = await post(app, MESSAGES, { text: 'four ideally' }, appAuth);

    expect(response.body).toBe('How many days a week?');
  });

  it('should hand the chat turn the message once intake is over', async () => {
    const turn: Handlers['turn'] = async (_deps, _text, write) => write('chat');
    const { app } = harness({ handlers: { ...intakeReply, turn } });

    expect((await post(app, MESSAGES, { text: 'how is my squat' }, appAuth)).body).toBe('chat');
  });
});

describe('POST /messages answering a pending proposal', () => {
  const handlers: Partial<Handlers> = {
    apply: async (deps) => newMessage('assistant', `${APPLIED} ${deps.state.messages.length}`),
    discard: async () => newMessage('assistant', KEPT),
    turn: async (_deps, _text, write) => write('chat'),
  };

  it('should stream the confirmation when the athlete applies the change', async () => {
    const { app } = harness({ handlers }, { pendingProposal });

    const response = await post(app, MESSAGES, { text: 'Apply changes', choice: 'apply' }, appAuth);

    expect(response.body).toBe(`${APPLIED} 1`);
  });

  it('should record the tapped pill as the athlete\'s message', async () => {
    const { app, state } = harness({ handlers }, { pendingProposal });

    await post(app, MESSAGES, { text: 'Apply changes', choice: 'apply' }, appAuth);

    expect(state.messages[0]).toMatchObject({ role: 'user', text: 'Apply changes' });
  });

  it('should stream the confirmation when the athlete keeps the block as it is', async () => {
    const { app } = harness({ handlers }, { pendingProposal });

    const response = await post(app, MESSAGES, { text: 'Keep as is', choice: 'keep' }, appAuth);

    expect(response.body).toBe(KEPT);
  });

  it('should take an apply choice as an ordinary turn when nothing is pending', async () => {
    const { app } = harness({ handlers });

    expect((await post(app, MESSAGES, { text: 'apply it', choice: 'apply' }, appAuth)).body).toBe('chat');
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
