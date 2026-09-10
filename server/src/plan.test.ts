import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from '@furkantanyol/hevy-client';
import { describe, expect, it } from 'vitest';
import type { CoachDeps } from './coach.js';
import { createProgram } from './plan.js';
import { contextBlock, SYSTEM_PROMPT, USER_INPUT_CLOSE, USER_INPUT_OPEN } from './prompt.js';
import { emptyState, type Message, type Profile } from './state.js';

const OK = 200;
const NOT_FOUND = 404;
const TEMPLATE_ID = 'SQ';
const TEMPLATE_TITLE = 'Squat (Barbell)';
const BEST_KG = 100;
const CAP_KG = 115;
const OVER_CAP_KG = 200;
const APPROVED_KG = 110;
const SETS = 3;
const REPS = 5;
const FOLDER_ID = 7;
const NEW_ROUTINE_ID = 'r-new-1';
const ANALYSIS = 'Squat has stalled for three sessions. Volume stays, load comes down.';
const MEMORY = 'Prefers early sessions. Left shoulder is the watch item.';
const SHOULDER_REPLY = 'my shoulder pinched on incline';
const PLAN_TASK_OPENING = 'Design the next training block';
const EMPTY_ANALYSIS = 'Before I write this I need to know which days of the week you can train.';
const EMPTY_BLOCK_LOG = `plan attempt returned an empty block (sessions: 0, exercises: 0): ${EMPTY_ANALYSIS}`;
const SESSION_A = 'Lower A';
const SESSION_B = 'Lower B';
const BLOCK_NAME = 'Autumn block';
const SESSION_COUNT = 2;
const ROUTINE_NAMES = `Open Hevy → Routines → HevyCoach: ${SESSION_A}, ${SESSION_B}`;
const CONFIRMATION = `Block written to Hevy: ${BLOCK_NAME}, ${SESSION_COUNT} sessions — ${SESSION_A}, ${SESSION_B}. The analysis has already been shown to the athlete; add at most two short lines: what to do first and one question. Do not repeat the analysis.`;
/** What the guard writes into the analysis once it stops asking the model and bounds the load itself. */
const ADJUSTMENT = `${TEMPLATE_TITLE} in ${SESSION_A}: weight capped at ${CAP_KG} kg (planned ${OVER_CAP_KG} kg)`;

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

const said = (role: Message['role'], text: string): Message => ({
  id: `${role}-${text}`,
  role,
  text,
  createdAt: '2026-09-10T10:00:00.000Z',
});

const squat = (weightKg: number) => ({
  templateId: TEMPLATE_ID,
  title: TEMPLATE_TITLE,
  sets: SETS,
  reps: REPS,
  weightKg,
  rpe: 8,
  note: 'Brace before you unrack.',
});

/** The guard wants at least two sessions, so only the first one carries the weight under test. */
function planJson(weightKg: number): string {
  return JSON.stringify({
    analysis: ANALYSIS,
    block: {
      name: BLOCK_NAME,
      weeks: 4,
      sessions: [
        { name: SESSION_A, focus: 'squat and hinge', exercises: [squat(weightKg)] },
        { name: SESSION_B, focus: 'squat and hinge', exercises: [squat(APPROVED_KG)] },
      ],
    },
  });
}

/** What the model returned twice in a live turn: the words in the analysis, nothing in the block. */
const EMPTY_PLAN_JSON = JSON.stringify({
  analysis: EMPTY_ANALYSIS,
  block: { name: '', weeks: 4, sessions: [] },
});

interface Sent {
  system: { type: string; text: string; cache_control?: { type: string } }[];
  messages: { role: string; content: string }[];
}

function anthropicStub(texts: string[]) {
  const sent: Sent[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';
    sent.push(JSON.parse(body) as Sent);
    const text = texts[sent.length - 1] ?? '';
    const message = {
      id: `msg-${sent.length}`,
      type: 'message',
      role: 'assistant',
      model: 'plan-model',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    return new Response(JSON.stringify(message), {
      status: OK,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { sent, client: new Anthropic({ apiKey: 'test', fetch: fetchImpl, maxRetries: 0 }) };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

const listed = (key: string, items: unknown[]) => ({ page: 1, page_count: 1, [key]: items });

const workoutSet = { index: 0, type: 'normal', weight_kg: BEST_KG, reps: REPS, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null };
const squatted = { index: 0, title: TEMPLATE_TITLE, notes: '', exercise_template_id: TEMPLATE_ID, superset_id: null, sets: [workoutSet] };
const logged = { id: 'w-1', title: SESSION_A, routine_id: null, description: '', start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T11:00:00Z', updated_at: '2026-09-01T11:00:00Z', created_at: '2026-09-01T11:00:00Z', exercises: [squatted] };
const template = { id: TEMPLATE_ID, title: TEMPLATE_TITLE, type: 'weight_reps', primary_muscle_group: 'quadriceps', secondary_muscle_groups: [], equipment: 'barbell', is_custom: false };

function hevyStub() {
  const calls: Call[] = [];
  const routes: Record<string, (call: Call) => unknown> = {
    '/v1/workouts': () => listed('workouts', [logged]),
    '/v1/body_measurements': () => listed('body_measurements', []),
    '/v1/exercise_templates': () => listed('exercise_templates', [template]),
    '/v1/routine_folders': (call) =>
      call.method === 'POST' ? { id: FOLDER_ID, index: 0, title: 'HevyCoach', updated_at: '', created_at: '' } : listed('routine_folders', []),
    '/v1/routines': () => ({ routine: { id: NEW_ROUTINE_ID } }),
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: Call = { method: init?.method ?? 'GET', path: url.pathname, body };
    calls.push(call);
    const route = Object.entries(routes).find(([path]) => call.path.startsWith(path))?.[1];
    if (!route) return new Response('not found', { status: NOT_FOUND });
    return new Response(JSON.stringify(route(call)), { status: OK });
  };

  return { calls, client: createHevyClient({ apiKey: 'test', fetch: fetchImpl, retries: 0 }) };
}

function harness(planTexts: string[]) {
  const anthropic = anthropicStub(planTexts);
  const hevy = hevyStub();
  const state = emptyState();
  const logs: string[] = [];
  const deps: CoachDeps = {
    anthropic: anthropic.client,
    hevy: hevy.client,
    state,
    save: async () => {},
    models: { plan: 'plan-model', chat: 'chat-model' },
    log: (message) => {
      logs.push(message);
    },
  };
  const written = () => hevy.calls.filter((call) => call.method !== 'GET' && call.path === '/v1/routines');
  return { deps, state, sent: anthropic.sent, written, logs };
}

const routinePost = (title: string, weightKg = APPROVED_KG): Call => ({
  method: 'POST',
  path: '/v1/routines',
  body: {
    routine: {
      title,
      folder_id: FOLDER_ID,
      exercises: [
        {
          exercise_template_id: TEMPLATE_ID,
          notes: 'RPE 8. Brace before you unrack.',
          sets: Array.from({ length: SETS }, () => ({ type: 'normal', weight_kg: weightKg, reps: REPS })),
        },
      ],
    },
  },
});

describe('createProgram', () => {
  it('should retry the plan once, naming the violation, when the guard rejects the first block', async () => {
    const { deps, sent } = harness([planJson(OVER_CAP_KG), planJson(APPROVED_KG)]);

    await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect(sent).toHaveLength(2);
    expect(sent[1].messages.at(-1)?.content).toContain(
      `weightKg ${OVER_CAP_KG} is above the ${CAP_KG} kg cap (1.15 x best logged ${BEST_KG} kg)`,
    );
  });

  it('should log the analysis and the counts when a plan attempt returns an empty block', async () => {
    const { deps, logs } = harness([EMPTY_PLAN_JSON, planJson(APPROVED_KG)]);

    await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect(logs).toEqual([EMPTY_BLOCK_LOG]);
  });

  it('should send the cached system prompt and the coach context to the plan model', async () => {
    const { deps, sent } = harness([planJson(APPROVED_KG)]);
    deps.state.memory = MEMORY;
    const context = contextBlock(deps.state);

    await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect(sent[0].system).toEqual([
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: context },
    ]);
  });

  it('should follow the recent thread with the plan task as the last user message', async () => {
    const { deps, sent } = harness([planJson(APPROVED_KG)]);
    deps.state.messages.push(said('user', SHOULDER_REPLY));

    await createProgram(deps, { profile: PROFILE, reason: 'shoulder reported' });

    expect(sent[0].messages).toEqual([
      { role: 'user', content: `${USER_INPUT_OPEN}\n${SHOULDER_REPLY}\n${USER_INPUT_CLOSE}` },
      { role: 'user', content: expect.stringContaining(PLAN_TASK_OPENING) },
    ]);
  });

  it('should write only the approved block to Hevy after a retry', async () => {
    const { deps, written } = harness([planJson(OVER_CAP_KG), planJson(APPROVED_KG)]);

    await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect(written()).toEqual([routinePost(SESSION_A), routinePost(SESSION_B)]);
  });

  it('should store the profile and the written routine id in state', async () => {
    const { deps, state } = harness([planJson(APPROVED_KG)]);

    await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect([state.profile, state.block?.sessions[0].hevyRoutineId]).toEqual([PROFILE, NEW_ROUTINE_ID]);
  });

  it('should close the analysis with the line naming the routines', async () => {
    const { deps } = harness([planJson(APPROVED_KG)]);

    const result = await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect(result.analysis).toBe(`${ANALYSIS}\n\n${ROUTINE_NAMES}`);
  });

  it('should confirm the written block to the model without repeating the analysis', async () => {
    const { deps } = harness([planJson(APPROVED_KG)]);

    const result = await createProgram(deps, { profile: PROFILE, reason: 'intake answered' });

    expect(result.confirmation).toBe(CONFIRMATION);
  });

  it('should clamp the load and write the block when the retry still breaks the guard', async () => {
    const { deps, written } = harness([planJson(OVER_CAP_KG), planJson(OVER_CAP_KG)]);

    await createProgram(deps, { profile: PROFILE, reason: 'intake' });

    expect(written()).toEqual([routinePost(SESSION_A, CAP_KG), routinePost(SESSION_B)]);
  });

  it('should close the analysis with what the guard adjusted', async () => {
    const { deps } = harness([planJson(OVER_CAP_KG), planJson(OVER_CAP_KG)]);

    const result = await createProgram(deps, { profile: PROFILE, reason: 'intake' });

    expect(result.analysis).toBe(`${ANALYSIS}\n\n**Guard adjustments**\n- ${ADJUSTMENT}\n\n${ROUTINE_NAMES}`);
  });

  it('should throw when the second block breaks a rule no fix can bound', async () => {
    const { deps } = harness([EMPTY_PLAN_JSON, EMPTY_PLAN_JSON]);

    await expect(createProgram(deps, { profile: PROFILE, reason: 'intake' })).rejects.toThrow(
      /broke the guard twice/,
    );
  });

  it('should write nothing to Hevy when the guard rejects a shape it cannot fix', async () => {
    const { deps, written } = harness([EMPTY_PLAN_JSON, EMPTY_PLAN_JSON]);

    await expect(createProgram(deps, { profile: PROFILE, reason: 'intake' })).rejects.toThrow();

    expect(written()).toEqual([]);
  });
});
