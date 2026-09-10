import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from '@furkantanyol/hevy-client';
import { describe, expect, it, vi } from 'vitest';
import { chatTurn, type CoachDeps } from './coach.js';
import { emptyState, type Block, type PendingProposal, type Profile, type State } from './state.js';

const OK = 200;
const NOT_FOUND = 404;
const TEMPLATE_ID = 'SQ';
const TEMPLATE_TITLE = 'Squat (Barbell)';
const ROUTINE_ID = 'r-1';
const NEW_ROUTINE_ID = 'r-new-1';
const FOLDER_ID = 7;
const SESSION_NAME = 'Lower A';
const SECOND_SESSION_NAME = 'Lower B';
/** Under the guard's no-history cap, so the stub needs no logged workouts behind it. */
const APPROVED_KG = 90;
const SETS = 3;
const REPS = 5;
const USER_TEXT = 'four days a week';
const AGREED_TEXT = 'yes, do it';
const PARTIAL_TEXT = 'Squat day it is.';
const PLAN_REPLY = 'Your block is in Hevy.';
const CLOSING_REPLY = 'Done.';
const APPLIED_TEXT = `Updated ${SESSION_NAME} in Hevy.`;
const KEPT_TEXT = 'Kept as is.';
const HEARTBEAT = '.';
const SLOW_PLAN_MS = 40_000;
/** 40 s of plan call spans the 15 s and the 30 s tick of the keep-alive. */
const DOTS_IN_A_SLOW_PLAN = 2;

const PROFILE: Profile = {
  goals: ['strength', 'muscle'],
  daysPerWeek: 3,
  bodyweightKg: 82,
  injuries: [],
  notes: '',
  equipment: 'full_gym',
  sessionMinutes: 60,
  yearsTraining: '3-5',
};

const EXERCISES = [{ templateId: TEMPLATE_ID, title: TEMPLATE_TITLE, sets: SETS, reps: REPS, weightKg: APPROVED_KG, rpe: 8, note: 'Brace before you unrack.' }];

const BLOCK: Block = {
  name: 'Autumn block',
  weeks: 4,
  createdAt: '2026-09-01T10:00:00.000Z',
  reason: 'intake answered',
  sessions: [{ name: SESSION_NAME, focus: 'squat and hinge', hevyRoutineId: ROUTINE_ID, exercises: EXERCISES }],
};

const PENDING: PendingProposal = { sessionIndex: 0, exercises: EXERCISES, messageId: 'm-review' };

const PLAN_JSON = JSON.stringify({
  analysis: 'Squat has stalled. Load comes down, volume stays.',
  block: {
    name: BLOCK.name,
    weeks: BLOCK.weeks,
    sessions: [
      { name: SESSION_NAME, focus: 'squat and hinge', exercises: EXERCISES },
      { name: SECOND_SESSION_NAME, focus: 'squat and hinge', exercises: EXERCISES },
    ],
  },
});

/** One streamed assistant turn: plain text (optionally cut short by an API error), or a single tool call. */
type Streamed = { text: string; fail?: true } | { tool: string; input: object };

function frames(reply: Streamed): object[] {
  const start = { type: 'message_start', message: { id: 'msg-stream', type: 'message', role: 'assistant', model: 'chat-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } };
  const stop = { type: 'message_stop' };
  if ('text' in reply) {
    const spoken = [
      start,
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: reply.text } },
    ];
    if (reply.fail) {
      return [...spoken, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }];
    }
    return [
      ...spoken,
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
      stop,
    ];
  }
  return [
    start,
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: reply.tool, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 2 } },
    stop,
  ];
}

function sseResponse(reply: Streamed): Response {
  const body = frames(reply)
    .map((frame) => `event: ${(frame as { type: string }).type}\ndata: ${JSON.stringify(frame)}\n\n`)
    .join('');
  return new Response(body, { status: OK, headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(text: string): Response {
  const message = { id: 'msg-json', type: 'message', role: 'assistant', model: 'plan-model', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
  return new Response(JSON.stringify(message), { status: OK, headers: { 'content-type': 'application/json' } });
}

interface Sent {
  messages: { role: string; content: unknown }[];
}

/** A plain reply is the JSON a plan call returns, optionally after `afterMs` on the clock. */
type Plain = string | { text: string; afterMs: number };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

function anthropicStub(streamed: Streamed[], plain: Plain[]) {
  const sent: Sent[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';
    sent.push(JSON.parse(body) as Sent);
    if (body.includes('"stream":true')) {
      const next = streamed.shift();
      if (!next) throw new Error('no streamed reply queued');
      return sseResponse(next);
    }
    const next = plain.shift();
    if (next === undefined) throw new Error('no plain reply queued');
    if (typeof next === 'string') return jsonResponse(next);
    await sleep(next.afterMs);
    return jsonResponse(next.text);
  };
  return { sent, client: new Anthropic({ apiKey: 'test', fetch: fetchImpl, maxRetries: 0 }) };
}

const listed = (key: string, items: unknown[]) => ({ page: 1, page_count: 1, [key]: items });

function hevyStub() {
  const routes: [string, (method: string) => unknown][] = [
    ['/v1/workouts', () => listed('workouts', [])],
    ['/v1/body_measurements', () => listed('body_measurements', [])],
    [
      '/v1/exercise_templates',
      () => listed('exercise_templates', [{ id: TEMPLATE_ID, title: TEMPLATE_TITLE, type: 'weight_reps', primary_muscle_group: 'quadriceps', secondary_muscle_groups: [], equipment: 'barbell', is_custom: false }]),
    ],
    ['/v1/routine_folders', (method) => (method === 'POST' ? { id: FOLDER_ID, index: 0, title: 'HevyCoach', updated_at: '', created_at: '' } : listed('routine_folders', []))],
    ['/v1/routines', () => ({ routine: { id: NEW_ROUTINE_ID } })],
  ];

  const fetchImpl: typeof fetch = async (input, init) => {
    const { pathname } = new URL(String(input));
    const route = routes.find(([path]) => pathname.startsWith(path))?.[1];
    if (!route) return new Response('not found', { status: NOT_FOUND });
    return new Response(JSON.stringify(route(init?.method ?? 'GET')), { status: OK });
  };

  return createHevyClient({ apiKey: 'test', fetch: fetchImpl, retries: 0 });
}

function harness(streamed: Streamed[] = [], plain: Plain[] = [], seed: Partial<State> = {}) {
  const state: State = { ...emptyState(), ...seed };
  const anthropic = anthropicStub(streamed, plain);
  const saved: string[][] = [];
  const deps: CoachDeps = {
    anthropic: anthropic.client,
    hevy: hevyStub(),
    state,
    save: async () => {
      saved.push(state.messages.map((message) => message.text));
    },
    models: { plan: 'plan-model', chat: 'chat-model' },
    log: () => {},
  };
  return { deps, state, saved, sent: anthropic.sent };
}

const planTurn = (): Streamed[] => [{ tool: 'create_program', input: { profile: PROFILE, reason: 'intake answered' } }, { text: PLAN_REPLY }];

const pending = (): Partial<State> => ({ block: structuredClone(BLOCK), pendingProposal: PENDING });

describe('chatTurn', () => {
  it('should save the user message before the turn can fail', async () => {
    const { deps, saved } = harness();

    await expect(chatTurn(deps, USER_TEXT, () => {})).rejects.toThrow();

    expect(saved).toEqual([[USER_TEXT]]);
  });

  it('should attach the written block to the plan message', async () => {
    const { deps, state } = harness(planTurn(), [PLAN_JSON]);

    await chatTurn(deps, USER_TEXT, () => {});

    expect(state.messages[1].block).toEqual(state.block);
  });

  it('should snapshot the block rather than share the live one', async () => {
    const { deps, state } = harness(planTurn(), [PLAN_JSON]);

    await chatTurn(deps, USER_TEXT, () => {});

    expect(state.messages[1].block).not.toBe(state.block);
  });

  it('should persist the text it already streamed when the turn fails midway', async () => {
    const { deps, saved } = harness([{ text: PARTIAL_TEXT, fail: true }]);

    await expect(chatTurn(deps, USER_TEXT, () => {})).rejects.toThrow();

    expect(saved.at(-1)).toEqual([USER_TEXT, PARTIAL_TEXT]);
  });

  it('should keep the stream alive with a dot every keep-alive interval while the plan runs', async () => {
    const { deps } = harness(planTurn(), [{ text: PLAN_JSON, afterMs: SLOW_PLAN_MS }]);
    const chunks: string[] = [];
    vi.useFakeTimers();

    try {
      const turn = chatTurn(deps, USER_TEXT, (chunk) => chunks.push(chunk));
      await vi.advanceTimersByTimeAsync(SLOW_PLAN_MS);
      await turn;
    } finally {
      vi.useRealTimers();
    }

    expect(chunks.filter((chunk) => chunk === HEARTBEAT)).toHaveLength(DOTS_IN_A_SLOW_PLAN);
  });

  it('should keep the heartbeat dots out of the saved assistant message', async () => {
    const { deps, state } = harness(planTurn(), [{ text: PLAN_JSON, afterMs: SLOW_PLAN_MS }]);
    vi.useFakeTimers();

    try {
      const turn = chatTurn(deps, USER_TEXT, () => {});
      await vi.advanceTimersByTimeAsync(SLOW_PLAN_MS);
      await turn;
    } finally {
      vi.useRealTimers();
    }

    expect(state.messages[1].text).toBe(PLAN_REPLY);
  });

  it('should leave the plan fields off a turn that wrote no block', async () => {
    const { deps, state } = harness([{ text: 'Upper/lower it is.' }]);

    await chatTurn(deps, USER_TEXT, () => {});

    expect(Object.keys(state.messages[1])).toEqual(['id', 'role', 'text', 'createdAt']);
  });

  it('should apply the pending proposal when the model calls apply_proposal', async () => {
    const { deps, state } = harness([{ tool: 'apply_proposal', input: {} }, { text: CLOSING_REPLY }], [], pending());

    await chatTurn(deps, AGREED_TEXT, () => {});

    expect(state.messages.map((message) => message.text)).toEqual([AGREED_TEXT, APPLIED_TEXT, CLOSING_REPLY]);
  });

  it('should answer the apply_proposal call with the confirmation the athlete reads', async () => {
    const { deps, sent } = harness([{ tool: 'apply_proposal', input: {} }, { text: CLOSING_REPLY }], [], pending());

    await chatTurn(deps, AGREED_TEXT, () => {});

    expect(sent[1].messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: APPLIED_TEXT }],
    });
  });

  it('should leave the plan fields off a turn that only applied a proposal', async () => {
    const { deps, state } = harness([{ tool: 'apply_proposal', input: {} }, { text: CLOSING_REPLY }], [], pending());

    await chatTurn(deps, AGREED_TEXT, () => {});

    expect(Object.keys(state.messages[2])).toEqual(['id', 'role', 'text', 'createdAt']);
  });

  it('should drop the pending proposal when the model calls discard_proposal', async () => {
    const { deps, state } = harness([{ tool: 'discard_proposal', input: {} }, { text: CLOSING_REPLY }], [], pending());

    await chatTurn(deps, 'no, leave it', () => {});

    expect([state.pendingProposal, state.messages[1].text]).toEqual([null, KEPT_TEXT]);
  });
});
