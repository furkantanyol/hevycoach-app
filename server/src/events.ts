import type { FastifyInstance } from 'fastify';
import type { State } from './state.js';

export const EVENTS_PATH = '/events';
const OK = 200;
/** Under Cloudflare's idle timeout, and often enough that a dead connection is noticed. */
const KEEPALIVE_MS = 15_000;
const HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
  connection: 'keep-alive',
};

type Listener = (messages: number) => void;
const listeners = new Set<Listener>();

/** Called after every save with the thread's length, so every open app hears that it moved. */
export function threadChanged(messages: number): void {
  for (const listener of listeners) listener(messages);
}

export function onThreadChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const frame = (messages: number): string => `event: thread\ndata: ${messages}\n\n`;

/**
 * GET /events: one server-sent event per thread change, the current length first so a reconnect
 * catches up. The app reloads on it when a review lands, instead of polling for one.
 */
export function eventsRoute(app: FastifyInstance, state: State): void {
  app.get(EVENTS_PATH, (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(OK, HEADERS);
    reply.raw.write(frame(state.messages.length));
    const stop = onThreadChange((messages) => reply.raw.write(frame(messages)));
    const keepAlive = setInterval(() => reply.raw.write(': keep-alive\n\n'), KEEPALIVE_MS);
    request.raw.on('close', () => {
      stop();
      clearInterval(keepAlive);
      reply.raw.end();
    });
  });
}
