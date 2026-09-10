import {
  ExportedMessageRepository,
  type ChatModelAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
  type ThreadHistoryAdapter,
} from '@assistant-ui/react-native';
// React Native's global fetch cannot stream a response body; expo/fetch can.
import { fetch } from 'expo/fetch';

const ERROR_PREFIX = 'Coach unavailable: ';

export type CoachExercise = {
  readonly templateId: string;
  readonly title: string;
  readonly sets: number;
  readonly reps: number;
  readonly weightKg: number;
  readonly rpe: number;
  readonly note: string;
};

export type CoachSession = {
  readonly name: string;
  readonly focus: string;
  readonly hevyRoutineId: string | null;
  readonly exercises: readonly CoachExercise[];
};

export type CoachBlock = {
  readonly name: string;
  readonly weeks: number;
  readonly sessions: readonly CoachSession[];
};

export type CoachMessage = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly createdAt: string;
  readonly kind?: 'plan' | 'verdict';
  readonly block?: CoachBlock;
  readonly session?: string;
};

type CoachRequest = {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
};

const baseUrl = process.env.EXPO_PUBLIC_COACH_URL;
const appToken = process.env.EXPO_PUBLIC_APP_TOKEN;

if (!baseUrl) {
  throw new Error('EXPO_PUBLIC_COACH_URL is missing. Set it in the app .env before starting Metro.');
}
if (!appToken) {
  throw new Error('EXPO_PUBLIC_APP_TOKEN is missing. Set it in the app .env before starting Metro.');
}

/** Every call to the coach server: base URL + bearer token. */
export function coachFetch(path: string, init: CoachRequest = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: init.method,
    body: init.body,
    signal: init.signal,
    headers: { ...init.headers, Authorization: `Bearer ${appToken}` },
  });
}

function lastUserText(messages: readonly ThreadMessage[]): string {
  const message = messages.findLast((candidate) => candidate.role === 'user');
  if (!message) return '';
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/** The server answers errors as JSON `{ error }`; fall back to the status line. */
async function errorLine(response: { status: number; text: () => Promise<string> }) {
  try {
    const body = await response.text();
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const { error } = parsed as { error: unknown };
      if (typeof error === 'string') return error;
    }
    return body || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export const coachChatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const response = await coachFetch('/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: lastUserText(messages) }),
      signal: abortSignal,
    });

    if (!response.ok) {
      yield { content: [{ type: 'text', text: ERROR_PREFIX + (await errorLine(response)) }] };
      return;
    }

    if (!response.body) {
      yield { content: [{ type: 'text', text: await response.text() }] };
      return;
    }

    const reader = response.body.getReader();
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
  },
};

function toMessageLike(message: CoachMessage): ThreadMessageLike {
  const custom = {
    ...(message.kind !== undefined && { kind: message.kind }),
    ...(message.block !== undefined && { block: message.block }),
    ...(message.session !== undefined && { session: message.session }),
  };
  return {
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt),
    content: [{ type: 'text', text: message.text }],
    metadata: { custom },
  };
}

export const coachHistoryAdapter: ThreadHistoryAdapter = {
  async load() {
    const response = await coachFetch('/messages');
    if (!response.ok) return { messages: [] };
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return { messages: [] };
    return ExportedMessageRepository.fromArray(
      (payload as readonly CoachMessage[]).map(toMessageLike),
    );
  },

  /**
   * No-op on purpose: POST /messages appends both the user turn and the
   * assistant reply to server/data/state.json, so appending here would
   * duplicate every message on the next load().
   */
  async append() {},
};
