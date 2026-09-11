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

import { serverChanged, serverErrorMessage, serverFetch } from './lib/server';
import type { Message } from './lib/types';

const ERROR_PREFIX = 'Coach unavailable: ';
const MESSAGES_PATH = '/messages';
/** Mirrors the server's STATUS_MARK: a line "\u001E<text>\n" in the stream is a status for the wait, not part of the reply. */
const STATUS_MARK = '\u001E';
const LINE_END = '\n';

interface UserTurn {
  readonly text: string;
  readonly choice: string | string[] | null;
}

/**
 * What has streamed so far: the reply as text parts, and the latest status line. A status that
 * arrives after words are already on screen closes that part, and the words after it open a new
 * one — the plan's read, then its lines for the week, each in its own bubble.
 */
interface Streamed {
  readonly parts: readonly string[];
  readonly status: string | null;
}

/** Every call to the coach server: base URL + bearer token. Lives in lib/server. */
export { serverFetch as coachFetch } from './lib/server';

/** The `choice` half of POST /messages: one tapped pill, or the pills a multi-select question sent together. */
function readChoice(value: unknown): string | string[] | null {
  if (typeof value === 'string') return value;
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string') ? value : null;
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

/** `kind`, `choices`, `multi` and `block` are what the message renderer reads back. */
function customOf(message: Message): Record<string, unknown> {
  return {
    ...(message.kind !== undefined && { kind: message.kind }),
    ...(message.choices !== undefined && { choices: message.choices }),
    ...(message.multi !== undefined && { multi: message.multi }),
    ...(message.block !== undefined && { block: message.block }),
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

/**
 * A status line still arriving (no line end yet) counts as the latest: statuses
 * are short and land in one chunk, and showing the head of one beats a blank.
 */
function parseStream(raw: string): Streamed {
  const [head = '', ...marked] = raw.split(STATUS_MARK);
  const parts = [head];
  let status: string | null = null;
  for (const segment of marked) {
    const end = segment.indexOf(LINE_END);
    if (end === -1) {
      status = segment;
      continue;
    }
    status = segment.slice(0, end);
    const words = segment.slice(end + LINE_END.length);
    if (parts.at(-1) === '') parts[parts.length - 1] = words;
    else parts.push(words);
  }
  return { parts, status };
}

/**
 * The stream read as it lands: the reply so far as the text part, the server's
 * latest status in `metadata.custom.status` for the typing indicator. Each is
 * yielded only when it changes; the saved message's own metadata replaces the
 * status once the reply is complete.
 */
async function* streamReply(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  abortSignal: AbortSignal,
): AsyncGenerator<ChatModelRunResult, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let shown: Streamed = { parts: [''], status: null };

  function* show(next: Streamed): Generator<ChatModelRunResult, void> {
    if (next.status !== shown.status) yield { metadata: { custom: { status: next.status } } };
    if (next.parts.join(STATUS_MARK) !== shown.parts.join(STATUS_MARK)) {
      yield { content: next.parts.map((text) => ({ type: 'text', text })) };
    }
    shown = next;
  }

  try {
    while (!abortSignal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      yield* show(parseStream(raw));
    }
  } finally {
    reader.releaseLock();
  }

  const tail = decoder.decode();
  if (tail) yield* show(parseStream(raw + tail));
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
    serverChanged();
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
