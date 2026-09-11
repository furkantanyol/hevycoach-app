import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply, type FastifyServerOptions } from 'fastify';
import { APPLY, deliveryOf, deviceToken, messageChoice, messageText, proposalChoice, TEXT_MAX_CHARACTERS } from './body.js';
import { eventsRoute } from './events.js';
import { type CoachDeps, applyProposal, chatTurn, discardProposal, review } from './coach.js';
import { progressChannel, type Reporter } from './progress.js';
import { cardsView, RECENT_WORKOUTS } from './derived.js';
import { recentWorkouts } from './hevy.js';
import { ensureOpener, handleIntakeReply, intakeActive } from './intake.js';
import { sendPush } from './push.js';
import type { State } from './state.js';
import { newMessage } from './thread.js';

const HEALTH_PATH = '/health';
const WEBHOOK_PATH = '/webhook/hevy';
const MESSAGES_PATH = '/messages';
const DEVICE_PATH = '/device';
const CARDS_PATH = '/cards';

const OK = 200;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_CONFIGURED = 503;

export const SEEN_EVENTS_MAX = 200;
const BEARER = 'Bearer ';
const COACH_ERROR = '\n[coach error] ';
const REVIEW_PUSH_TITLE = 'Review of your workout is ready';
const PUSH_DATA = { url: '/' };
const DELIVERY = 'hevy delivery';
const REJECTED_DELIVERY = 'hevy delivery rejected';
/** Posted when the review fails after the workout was announced, so the app's wait under it ends. */
const REVIEW_FAILED = 'I could not review that workout just now.';
const TURN_COMPLETED = 'chat turn completed';
const TURN_FAILED = 'chat turn failed';
const REDACTED = '[redacted]';
const DEFAULT_LOG_LEVEL = 'info';

const STREAM_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  // `no-transform` keeps Cloudflare from compressing the stream, which would hold chunks back in bursts.
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
  'transfer-encoding': 'chunked',
};

/** Everything a route hands to the coach. Tests replace the ones they exercise; the rest stay live. */
export interface Handlers {
  turn: typeof chatTurn;
  review: typeof review;
  opener: typeof ensureOpener;
  intakeReply: typeof handleIntakeReply;
  apply: typeof applyProposal;
  discard: typeof discardProposal;
  push: typeof sendPush;
}

const LIVE: Handlers = {
  turn: chatTurn,
  review,
  opener: ensureOpener,
  intakeReply: handleIntakeReply,
  apply: applyProposal,
  discard: discardProposal,
  push: sendPush,
};

export interface RouteDeps {
  state: State;
  save: () => Promise<void>;
  coach: CoachDeps;
  appToken?: string;
  webhookSecret?: string;
  pushToken: () => string | null;
  handlers?: Partial<Handlers>;
  logger?: FastifyBaseLogger;
}

function handlersOf(deps: RouteDeps): Handlers {
  return { ...LIVE, ...deps.handlers };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/** The pill the athlete tapped is their turn in the thread, ahead of whatever the coach answers. */
async function rememberReply(deps: RouteDeps, text: string): Promise<void> {
  deps.state.messages.push(newMessage('user', text));
  await deps.save();
}

function openStream(reply: FastifyReply): (chunk: string) => void {
  reply.hijack();
  reply.raw.writeHead(OK, STREAM_HEADERS);
  return (chunk: string) => {
    reply.raw.write(chunk);
  };
}

/** chatTurn tags the message it saved, so a turn that wrote a block leaves a plan message last. */
function turnRecord(deps: RouteDeps, startedAt: number): { ms: number; planned: boolean } {
  return { ms: Date.now() - startedAt, planned: deps.coach.state.messages.at(-1)?.kind === 'plan' };
}

/** Fastify logs no "request completed" line for a hijacked reply, so the turn logs its own. */
async function streamTurn(deps: RouteDeps, reply: FastifyReply, text: string): Promise<void> {
  const write = openStream(reply);
  const startedAt = Date.now();
  try {
    await handlersOf(deps).turn(deps.coach, text, write);
    reply.log.info(turnRecord(deps, startedAt), TURN_COMPLETED);
  } catch (error) {
    write(`${COACH_ERROR}${describe(error)}`);
    reply.log.info(turnRecord(deps, startedAt), `${TURN_FAILED}: ${describe(error)}`);
  }
  reply.raw.end();
}

/** The scripted branches speak through the reporter — statuses while they work, words as they are written — on the same text/plain stream the chat turn uses. */
async function streamMessage(reply: FastifyReply, run: (report: Reporter) => Promise<void>): Promise<void> {
  const write = openStream(reply);
  const progress = progressChannel(write);
  try {
    await run({ status: progress.status, say: write });
  } catch (error) {
    write(`${COACH_ERROR}${describe(error)}`);
    reply.log.info(`${TURN_FAILED}: ${describe(error)}`);
  } finally {
    progress.stop();
  }
  reply.raw.end();
}

async function notify(deps: RouteDeps, log: FastifyBaseLogger, workoutId: string): Promise<void> {
  const handlers = handlersOf(deps);
  try {
    const result = await handlers.review(deps.coach, workoutId);
    if (!result) return;

    const token = deps.pushToken();
    if (!token) {
      log.info('review written, no push token registered');
      return;
    }

    const sent = await handlers.push(token, REVIEW_PUSH_TITLE, result.pushBody, PUSH_DATA);
    log.info(sent.sent ? 'review push sent' : `review push failed: ${sent.error ?? 'unknown'}`);
  } catch (error) {
    log.error(`review failed for workout ${workoutId}: ${describe(error)}`);
    deps.state.messages.push(newMessage('assistant', REVIEW_FAILED));
    await deps.save();
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

/** Three branches, one stream: a pending proposal answered, the intake script, or an ordinary turn. */
function postMessage(deps: RouteDeps, reply: FastifyReply, text: string, choice: string | string[] | undefined) {
  const handlers = handlersOf(deps);
  const answered = proposalChoice(deps.state, choice);

  if (answered) {
    return streamMessage(reply, async (report) => {
      await rememberReply(deps, text);
      const decided = answered === APPLY ? handlers.apply : handlers.discard;
      report.say((await decided(deps.coach)).text);
    });
  }

  if (intakeActive(deps.state)) {
    return streamMessage(reply, (report) => handlers.intakeReply(deps.coach, text, choice, report));
  }

  return streamTurn(deps, reply, text);
}

function appRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get(HEALTH_PATH, async () => ({ ok: true }));
  eventsRoute(app, deps.state);

  app.get(MESSAGES_PATH, async () => {
    await handlersOf(deps).opener(deps.coach);
    return deps.state.messages;
  });

  app.post(MESSAGES_PATH, async (request, reply) => {
    const text = messageText(request.body);
    if (!text) {
      const error = `text must be a non-empty string of at most ${TEXT_MAX_CHARACTERS} characters`;
      return reply.code(BAD_REQUEST).send({ error });
    }
    return postMessage(deps, reply, text, messageChoice(request.body));
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

  app.get(CARDS_PATH, async () => {
    const recent = await recentWorkouts(deps.coach.hevy, RECENT_WORKOUTS);
    return cardsView(deps.state.block, recent, new Date());
  });
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

    // Every delivery is logged whole, before validation: the real contract has not been recorded yet
    // (three live deliveries were rejected on 2026-09-11 with nothing kept), and the bodies are small.
    request.log.info({ headers: withoutSecrets(request.headers), body: request.body }, DELIVERY);

    const delivery = deliveryOf(request.body);
    if (!delivery) {
      request.log.warn({ body: request.body }, REJECTED_DELIVERY);
      return reply.code(BAD_REQUEST).send({ error: 'expected { workoutId }' });
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
  webhookRoute(app, deps);

  return app;
}
