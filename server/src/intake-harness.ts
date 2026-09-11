/**
 * The account and the model the intake tests run against: twelve workouts (a history the existing
 * script trusts) or the few a newcomer has, one bodyweight, one template, one folder. Shared so
 * the intake suite reads as tests rather than as fixtures.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from 'hevy-sdk';
import type { CoachDeps } from './coach.js';
import { ensureOpener, handleIntakeReply } from './intake.js';
import { emptyState } from './state.js';

const OK = 200;
const SERVER_ERROR = 500;
const NOT_FOUND = 404;
const BEST_KG = 100;
const APPROVED_KG = 110;
const FOLDER_ID = 7;
const ROUTINE_ID = 'r-new-1';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export const TEMPLATE_ID = 'SQ';
export const TEMPLATE_TITLE = 'Squat (Barbell)';
export const BODYWEIGHT_KG = 82;
/** The coach's read, streamed ahead of the block in every plan the intake suite writes. */
export const READ = 'Squat 130, deadlift 155, bench stuck at 105. This block earns the bench back through volume.';
export const SESSION_MINUTES = 60;
/** The routine every fake workout was logged from: what a continuation builds on. */
export const CURRENT_ROUTINE_ID = 'r-current';
export const CURRENT_ROUTINE_TITLE = 'Lower';
/** At or above the server's threshold, so the opener runs the existing script. */
export const LOGGED_WORKOUTS = 12;
/** Below it, so the opener runs the new-to-Hevy script. */
export const FEW_WORKOUTS = 2;
const DAYS_BETWEEN_WORKOUTS = 3;
const NEWEST_WORKOUT_DAYS_AGO = 2;

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

const listed = (key: string, items: unknown[]) => ({ page: 1, page_count: 1, [key]: items });

const workingSet = { index: 0, type: 'normal', weight_kg: BEST_KG, reps: 5, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null };
const squatted = { index: 0, title: TEMPLATE_TITLE, notes: '', exercise_template_id: TEMPLATE_ID, superset_id: null, sets: [workingSet] };

function workout(daysAgo: number, routineId: string | null) {
  const start = Date.now() - daysAgo * MS_PER_DAY;
  const startedAt = iso(start);
  const endedAt = iso(start + SESSION_MINUTES * MS_PER_MINUTE);
  return { id: `w-${daysAgo}`, title: CURRENT_ROUTINE_TITLE, routine_id: routineId, description: '', start_time: startedAt, end_time: endedAt, updated_at: endedAt, created_at: startedAt, exercises: [squatted] };
}

interface HevyStubOptions {
  measurements?: unknown[];
  brokenPath?: string;
  logged?: number;
  /** Workouts logged without a routine, so a continuation finds nothing to continue. */
  routineless?: boolean;
}

const HELD_BODYWEIGHT = [{ date: iso(Date.now()), weight_kg: BODYWEIGHT_KG }];
const CURRENT_ROUTINE = {
  id: CURRENT_ROUTINE_ID,
  title: CURRENT_ROUTINE_TITLE,
  folder_id: null,
  updated_at: '',
  created_at: '',
  exercises: [{ index: 0, title: TEMPLATE_TITLE, notes: '', exercise_template_id: TEMPLATE_ID, superset_id: null, sets: [{ index: 0, type: 'normal', weight_kg: BEST_KG, reps: 5 }] }],
};

/** The newest workout two days ago, one every three days before it. */
const workouts = (count: number, routineId: string | null) =>
  Array.from({ length: count }, (_, index) => workout(NEWEST_WORKOUT_DAYS_AGO + index * DAYS_BETWEEN_WORKOUTS, routineId));

export function hevyStub({ measurements = HELD_BODYWEIGHT, brokenPath, logged = LOGGED_WORKOUTS, routineless = false }: HevyStubOptions = {}) {
  const routes: Record<string, (method: string) => unknown> = {
    '/v1/workouts': () => listed('workouts', workouts(logged, routineless ? null : CURRENT_ROUTINE_ID)),
    '/v1/body_measurements': () => listed('body_measurements', measurements),
    '/v1/exercise_templates': () =>
      listed('exercise_templates', [
        { id: TEMPLATE_ID, title: TEMPLATE_TITLE, type: 'weight_reps', primary_muscle_group: 'quadriceps', secondary_muscle_groups: [], equipment: 'barbell', is_custom: false },
      ]),
    [`/v1/routines/${CURRENT_ROUTINE_ID}`]: () => ({ routine: CURRENT_ROUTINE }),
    '/v1/routine_folders': (method) =>
      method === 'POST' ? { id: FOLDER_ID, index: 0, title: 'Coach', updated_at: '', created_at: '' } : listed('routine_folders', []),
    '/v1/routines': () => ({ routine: { id: ROUTINE_ID } }),
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === brokenPath) return new Response('nope', { status: SERVER_ERROR });
    const route = Object.entries(routes).find(([known]) => path.startsWith(known))?.[1];
    if (!route) return new Response('not found', { status: NOT_FOUND });
    return new Response(JSON.stringify(route(init?.method ?? 'GET')), { status: OK });
  };
  return createHevyClient({ apiKey: 'test', fetch: fetchImpl, retries: 0 });
}

/** Every request body the model was sent, so a test can read the system block and the schema it asked for. */
interface Sent {
  system: { text: string }[];
  messages: { role: string; content: string }[];
  output_config: { format: { schema: { properties: { field: Record<string, unknown> } } } };
}


/** One streamed text reply, as the SDK's stream parser expects it: the read of the athlete, in one delta. */
function sseResponse(text: string): Response {
  const start = { type: 'message_start', message: { id: 'msg-stream', type: 'message', role: 'assistant', model: 'plan-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } };
  const frames = [
    start,
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ];
  const body = frames.map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join('');
  return new Response(body, { status: OK, headers: { 'content-type': 'text/event-stream' } });
}

/** Every reply the model gives, in order; a streamed request (the read) is answered as SSE, the rest as JSON. */
function anthropicStub(texts: string[]) {
  const sent: Sent[] = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = typeof init?.body === 'string' ? init.body : '{}';
    sent.push(JSON.parse(body) as Sent);
    if (body.includes('"stream":true')) return sseResponse(texts[sent.length - 1] ?? '');
    const message = {
      id: `msg-${sent.length}`,
      type: 'message',
      role: 'assistant',
      model: 'chat-model',
      content: [{ type: 'text', text: texts[sent.length - 1] ?? '' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    return new Response(JSON.stringify(message), { status: OK, headers: { 'content-type': 'application/json' } });
  };
  return { sent, client: new Anthropic({ apiKey: 'test', fetch: fetchImpl, maxRetries: 0 }) };
}

export function harness(texts: string[] = [], hevy = hevyStub()) {
  const anthropic = anthropicStub(texts);
  const state = emptyState();
  const logs: string[] = [];
  const deps: CoachDeps = {
    anthropic: anthropic.client,
    hevy,
    state,
    save: async () => {},
    models: { plan: 'plan-model', chat: 'chat-model' },
    log: (line) => {
      logs.push(line);
    },
  };
  return { deps, state, sent: anthropic.sent, logs };
}

/** The block the plan model writes back in the intake suite, and the JSON body it comes in. */
export const ANALYSIS = 'Squat has stalled for three sessions. Volume stays, load comes down.';
export const SESSION_A = 'Day 1 - Heavy Lower';
export const SESSION_B = 'Day 2 - Heavy Upper';

const squat = (weightKg: number) => ({
  templateId: TEMPLATE_ID,
  title: TEMPLATE_TITLE,
  sets: 3,
  reps: 5,
  weightKg,
  rpe: 8,
  note: 'Brace before you unrack.',
});

export const PLAN_JSON = JSON.stringify({
  analysis: ANALYSIS,
  block: {
    name: 'Autumn block',
    weeks: 4,
    sessions: [
      { name: SESSION_A, focus: 'squat and hinge', exercises: [squat(APPROVED_KG)] },
      { name: SESSION_B, focus: 'press and pull', exercises: [squat(APPROVED_KG)] },
    ],
  },
});

/** One interpreted reply, as the model returns it for the step the script is waiting on. */
export const answered = (field: unknown): string => JSON.stringify({ field, unclear: false });

export const last = (deps: CoachDeps) => deps.state.messages.at(-1);

export const tap = (deps: CoachDeps, text: string, choice: string | string[]) => handleIntakeReply(deps, text, choice);
export const typed = (deps: CoachDeps, text: string) => handleIntakeReply(deps, text, undefined);

export const NOTHING_TO_ADD = 'Nothing to add';

export const START_NEW = 'Start new';
export const CONTINUE = 'Continue';

/** The existing script, answered with pills: a fresh start, one goal, the days. Stops on injuries. */
export async function toInjuries(deps: CoachDeps): Promise<void> {
  await ensureOpener(deps);
  await tap(deps, START_NEW, 'existing');
  await tap(deps, 'Muscle', ['muscle']);
  await tap(deps, '4', '4');
}

/** The same, plus a tapped "Nothing", leaving the script on the bodyweight question. */
export async function toBodyweight(deps: CoachDeps): Promise<void> {
  await toInjuries(deps);
  await tap(deps, 'Nothing', 'nothing');
}

/** The existing script, answered with pills, left on the closing question. */
export async function toNotes(deps: CoachDeps): Promise<void> {
  await toBodyweight(deps);
  await tap(deps, `Yes, ${BODYWEIGHT_KG} kg`, 'yes');
}

/** Taps the closing question's one pill, so the profile is saved and the plan written. */
export const skipNotes = (deps: CoachDeps) => tap(deps, NOTHING_TO_ADD, 'nothing');

/** The new-to-Hevy script (a harness with `FEW_WORKOUTS`), answered with pills, left on the typed bodyweight question. */
export async function toNewBodyweight(deps: CoachDeps): Promise<void> {
  await ensureOpener(deps);
  await tap(deps, '5 years or more', '5+');
  await tap(deps, '4', '4');
  await tap(deps, 'Home gym', 'home_gym');
  await tap(deps, 'Muscle', ['muscle']);
  await tap(deps, 'Nothing', 'nothing');
}
