import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply, type FastifyServerOptions } from 'fastify';
import { chatTurn, type CoachDeps, verdict } from './coach.js';
import { blockView, cacheFor, PREFILL_WORKOUTS, prefillFrom, progressView, RECENT_WORKOUTS, SUMMARY_TTL_MS, validateProfile } from './derived.js';
import { historySummary, recentWorkouts } from './hevy.js';
import { sendPush } from './push.js';
import type { State } from './state.js';

const HEALTH_PATH = '/health';
const WEBHOOK_PATH = '/webhook/hevy';
const MESSAGES_PATH = '/messages';
const DEVICE_PATH = '/device';
const PREFILL_PATH = '/prefill';
const PROFILE_PATH = '/profile';
const BLOCK_PATH = '/block';
const PROGRESS_PATH = '/progress';

const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_CONFIGURED = 503;

export const SEEN_EVENTS_MAX = 200;
const TEXT_MAX_CHARACTERS = 4000;
const BEARER = 'Bearer ';
const COACH_ERROR = '\n[coach error] ';
const PUSH_TITLE_FALLBACK = 'Session logged';
const PUSH_DATA = { url: '/' };
const FIRST_DELIVERY = 'first hevy delivery';
const TURN_COMPLETED = 'chat turn completed';
const TURN_FAILED = 'chat turn failed';
const REDACTED = '[redacted]';
const DEFAULT_LOG_LEVEL = 'info';

const STREAM_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-cache',
  'transfer-encoding': 'chunked',
};

export interface RouteDeps {
  state: State;
  save: () => Promise<void>;
  coach: CoachDeps;
  appToken?: string;
  webhookSecret?: string;
  pushToken: () => string | null;
  /** Test seams: the routes call the real coach, clock and logger unless these are supplied. */
  turn?: typeof chatTurn;
  judge?: typeof verdict;
  logger?: FastifyBaseLogger;
  now?: () => number;
}

interface Delivery {
  id: string;
  workoutId: string;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function messageText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { text } = body as { text?: unknown };
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > TEXT_MAX_CHARACTERS) return null;
  return trimmed;
}

function deviceToken(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { expoPushToken } = body as { expoPushToken?: unknown };
  if (typeof expoPushToken !== 'string' || expoPushToken.length === 0) return null;
  return expoPushToken;
}

function deliveryOf(body: unknown): Delivery | null {
  if (typeof body !== 'object' || body === null) return null;
  const { id, payload } = body as { id?: unknown; payload?: unknown };
  if (typeof id !== 'string' || typeof payload !== 'object' || payload === null) return null;
  const { workoutId } = payload as { workoutId?: unknown };
  if (typeof workoutId !== 'string') return null;
  return { id, workoutId };
}

/** The authorization header carries WEBHOOK_SECRET, so it never reaches a log record. */
function withoutSecrets(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  return { ...headers, authorization: REDACTED };
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Hashing first keeps the comparison constant-time whatever the two lengths are. */
function constantTimeEquals(value: string, expected: string): boolean {
  return timingSafeEqual(digest(value), digest(expected));
}

function secretMatches(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const token = header.startsWith(BEARER) ? header.slice(BEARER.length) : header;
  return constantTimeEquals(token, secret);
}

function remember(state: State, id: string): void {
  state.seenEvents.push(id);
  const overflow = state.seenEvents.length - SEEN_EVENTS_MAX;
  if (overflow > 0) state.seenEvents.splice(0, overflow);
}

/** chatTurn tags the message it saved, so a turn that wrote a block leaves a plan message last. */
function turnRecord(deps: RouteDeps, startedAt: number): { ms: number; planned: boolean } {
  return { ms: Date.now() - startedAt, planned: deps.coach.state.messages.at(-1)?.kind === 'plan' };
}

/** Fastify logs no "request completed" line for a hijacked reply, so the turn logs its own. */
async function streamTurn(deps: RouteDeps, reply: FastifyReply, text: string): Promise<void> {
  reply.hijack();
  reply.raw.writeHead(OK, STREAM_HEADERS);
  const startedAt = Date.now();
  try {
    await (deps.turn ?? chatTurn)(deps.coach, text, (chunk) => {
      reply.raw.write(chunk);
    });
    reply.log.info(turnRecord(deps, startedAt), TURN_COMPLETED);
  } catch (error) {
    reply.raw.write(`${COACH_ERROR}${describe(error)}`);
    reply.log.info(turnRecord(deps, startedAt), `${TURN_FAILED}: ${describe(error)}`);
  }
  reply.raw.end();
}

async function notify(deps: RouteDeps, log: FastifyBaseLogger, workoutId: string): Promise<void> {
  try {
    const result = await (deps.judge ?? verdict)(deps.coach, workoutId);
    if (!result) return;

    const token = deps.pushToken();
    if (!token) {
      log.info('verdict written, no push token registered');
      return;
    }

    const title = result.sessionName ?? PUSH_TITLE_FALLBACK;
    const sent = await sendPush(token, title, result.pushBody, PUSH_DATA);
    log.info(sent.sent ? 'verdict push sent' : `verdict push failed: ${sent.error ?? 'unknown'}`);
  } catch (error) {
    log.error(`verdict failed for workout ${workoutId}: ${describe(error)}`);
  }
}

function appTokenHook(app: FastifyInstance, appToken: string | undefined): void {
  app.addHook('onRequest', async (request, reply) => {
    const path = request.routeOptions.url;
    if (path === HEALTH_PATH || path === WEBHOOK_PATH) return;

    if (!appToken) {
      return reply.code(NOT_CONFIGURED).send({ error: 'server not configured' });
    }

    if (!constantTimeEquals(request.headers.authorization ?? '', `${BEARER}${appToken}`)) {
      return reply.code(UNAUTHORIZED).send({ error: 'unauthorized' });
    }
  });
}

function appRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get(HEALTH_PATH, async () => ({ ok: true }));

  app.get(MESSAGES_PATH, async () => deps.state.messages);

  app.post(MESSAGES_PATH, async (request, reply) => {
    const text = messageText(request.body);
    if (!text) {
      const error = `text must be a non-empty string of at most ${TEXT_MAX_CHARACTERS} characters`;
      return reply.code(BAD_REQUEST).send({ error });
    }
    return streamTurn(deps, reply, text);
  });

  app.post(DEVICE_PATH, async (request, reply) => {
    const token = deviceToken(request.body);
    if (!token) {
      return reply.code(BAD_REQUEST).send({ error: 'expoPushToken must be a non-empty string' });
    }
    deps.state.pushToken = token;
    await deps.save();
    return reply.code(NO_CONTENT).send();
  });
}

/** The summary walks every workout page, so /prefill and /progress share one cached read. */
function dataRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { hevy } = deps.coach;
  const summary = cacheFor(SUMMARY_TTL_MS, () => historySummary(hevy), deps.now);

  app.get(PREFILL_PATH, async () =>
    prefillFrom(await summary(), await recentWorkouts(hevy, PREFILL_WORKOUTS)),
  );

  app.get(PROFILE_PATH, async () => ({ profile: deps.state.profile }));

  app.put(PROFILE_PATH, async (request, reply) => {
    const result = validateProfile(request.body);
    if ('error' in result) return reply.code(BAD_REQUEST).send({ error: result.error });
    deps.state.profile = result.profile;
    await deps.save();
    return { profile: result.profile };
  });

  app.get(BLOCK_PATH, async () =>
    blockView(deps.state.block, await recentWorkouts(hevy, RECENT_WORKOUTS), deps.state.messages),
  );

  app.get(PROGRESS_PATH, async () =>
    progressView(await summary(), await recentWorkouts(hevy, RECENT_WORKOUTS)),
  );
}

function webhookRoute(app: FastifyInstance, deps: RouteDeps): void {
  app.post(WEBHOOK_PATH, async (request, reply) => {
    const { webhookSecret } = deps;
    if (!webhookSecret) {
      return reply.code(NOT_CONFIGURED).send({ error: 'webhook not configured' });
    }
    if (!secretMatches(request.headers.authorization, webhookSecret)) {
      return reply.code(UNAUTHORIZED).send({ error: 'unauthorized' });
    }

    // The delivery shape was never exercised against the live API, so log the first one in full,
    // before validation, or a wrong guess is rejected without ever recording the real contract.
    if (deps.state.seenEvents.length === 0) {
      request.log.info({ headers: withoutSecrets(request.headers), body: request.body }, FIRST_DELIVERY);
    }

    const delivery = deliveryOf(request.body);
    if (!delivery) {
      return reply.code(BAD_REQUEST).send({ error: 'expected { id, payload: { workoutId } }' });
    }
    if (deps.state.seenEvents.includes(delivery.id)) {
      return reply.code(OK).send({ recorded: false, notified: false });
    }

    remember(deps.state, delivery.id);
    await deps.save();
    setImmediate(() => {
      void notify(deps, request.log, delivery.workoutId);
    });
    return reply.code(OK).send({ recorded: true, notified: false });
  });
}

function loggerOptions(logger: FastifyBaseLogger | undefined): FastifyServerOptions {
  if (logger) return { loggerInstance: logger };
  return { logger: { level: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL } };
}

export function buildApp(deps: RouteDeps): FastifyInstance {
  const app = Fastify(loggerOptions(deps.logger));

  appTokenHook(app, deps.appToken);
  appRoutes(app, deps);
  dataRoutes(app, deps);
  webhookRoute(app, deps);

  return app;
}
