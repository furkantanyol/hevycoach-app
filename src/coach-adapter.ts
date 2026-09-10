/**
 * The two adapters the thread runs on: `run()` posts a turn to the coach and
 * streams the reply back, `load()` reads the server's copy of the thread.
 *
 * A tapped pill is a normal user turn with its `value` carried in
 * `metadata.custom.choice` — the chat adapter only ever sees ThreadMessages,
 * so that metadata is the one channel from the pill to this POST body.
 */
import {
  ExportedMessageRepository,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ThreadMessage,
  type ThreadMessageLike,
  type ThreadHistoryAdapter,
} from '@assistant-ui/react-native';

import { serverErrorMessage, serverFetch } from './lib/server';
import type { Message } from './lib/types';

const ERROR_PREFIX = 'Coach unavailable: ';
const MESSAGES_PATH = '/messages';

/** The `choice` half of POST /messages: one value, or a multi-select's values. */
export type ChoiceValue = string | readonly string[];

interface UserTurn {
  readonly text: string;
  readonly choice: ChoiceValue | null;
}

/** Every call to the coach server: base URL + bearer token. Lives in lib/server. */
export { serverFetch as coachFetch } from './lib/server';

function readChoice(value: unknown): ChoiceValue | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value as readonly string[];
  }
  return null;
}

function lastUserTurn(messages: readonly ThreadMessage[]): UserTurn {
  const message = messages.findLast((candidate) => candidate.role === 'user');
  if (!message) return { text: '', choice: null };
  return {
    text: message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n'),
    choice: readChoice(message.metadata.custom.choice),
  };
}

/** `kind`, `choices`, `multi` and `input` are what the message renderer reads back. */
function customOf(message: Message): Record<string, unknown> {
  return {
    ...(message.kind !== undefined && { kind: message.kind }),
    ...(message.choices !== undefined && { choices: message.choices }),
    ...(message.multi !== undefined && { multi: message.multi }),
    ...(message.input !== undefined && { input: message.input }),
  };
}

/** GET /messages, or an empty thread when the server or the payload says no. */
async function loadMessages(): Promise<readonly Message[]> {
  const response = await serverFetch(MESSAGES_PATH);
  if (!response.ok) return [];
  const payload: unknown = await response.json();
  return Array.isArray(payload) ? (payload as readonly Message[]) : [];
}

/**
 * POST /messages answers `text/plain`, so a reply that arrives live carries no
 * `choices` — only the server's saved copy of it does. Reading the thread back
 * once the stream ends and carrying the tail's metadata onto the message just
 * streamed is what puts pills under a live reply instead of only under one
 * that came from `load()`. A failure here costs the pills, never the reply, so
 * it stays quiet and the athlete types the answer instead.
 */
async function tailCustom(): Promise<Record<string, unknown> | null> {
  try {
    const last = (await loadMessages()).at(-1);
    if (last === undefined || last.role !== 'assistant') return null;
    const custom = customOf(last);
    return Object.keys(custom).length === 0 ? null : custom;
  } catch {
    return null;
  }
}

/** Plain text read as it lands: every chunk yields the whole reply so far. */
async function* streamReply(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  abortSignal: AbortSignal,
): AsyncGenerator<ChatModelRunResult, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (!abortSignal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      yield { content: [{ type: 'text', text }] };
    }
  } finally {
    reader.releaseLock();
  }

  const tail = decoder.decode();
  if (tail) yield { content: [{ type: 'text', text: text + tail }] };
}

export const coachChatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const { text: turnText, choice } = lastUserTurn(messages);
    const response = await serverFetch(MESSAGES_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: turnText, ...(choice !== null && { choice }) }),
      signal: abortSignal,
    });

    if (!response.ok) {
      yield { content: [{ type: 'text', text: ERROR_PREFIX + (await serverErrorMessage(response)) }] };
      return;
    }

    if (response.body === null) {
      yield { content: [{ type: 'text', text: await response.text() }] };
    } else {
      yield* streamReply(response.body, abortSignal);
    }

    if (abortSignal.aborted) return;
    const custom = await tailCustom();
    if (custom !== null) yield { metadata: { custom } };
  },
};

function toMessageLike(message: Message): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt),
    content: [{ type: 'text', text: message.text }],
    metadata: { custom: customOf(message) },
  };
}

export const coachHistoryAdapter: ThreadHistoryAdapter = {
  async load() {
    return ExportedMessageRepository.fromArray((await loadMessages()).map(toMessageLike));
  },

  /**
   * No-op on purpose: POST /messages appends both the user turn and the
   * assistant reply to the server's state, so appending here would duplicate
   * every message on the next load().
   */
  async append() {},
};
