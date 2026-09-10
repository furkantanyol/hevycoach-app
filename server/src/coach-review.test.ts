import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient } from '@furkantanyol/hevy-client';
import { describe, expect, it } from 'vitest';
import { applyProposal, type CoachDeps, discardProposal, review } from './coach.js';
import { MEMORY_MAX_CHARACTERS } from './review-prompt.js';
import { emptyState, type Block, type Exercise, type PendingProposal, type State } from './state.js';

const OK = 200;
const NOT_FOUND = 404;
const TEMPLATE_ID = 'SQ';
const TEMPLATE_TITLE = 'Squat (Barbell)';
const ROUTINE_ID = 'r-1';
const FOLDER_ID = 7;
const WORKOUT_ID = 'w-1';
const MISSING_WORKOUT_ID = 'w-gone';
const SESSION_NAME = 'Lower A';
const OTHER_SESSION_NAME = 'Upper B';
const BEST_KG = 100;
const CAP_KG = 115;
const PROPOSED_KG = 95;
const OVER_CAP_KG = 200;
const SETS = 3;
const REPS = 5;
const REVIEW_HEADLINE = 'Squat moved for all three sets.';
const REVIEW_TEXT = `${REVIEW_HEADLINE}\nSame load next week. How did the last set feel?`;
const MEMORY = 'Squat at 100 kg for 3x5 at RPE 8.';
const SUMMARY = 'Squat goes to 95 kg next week.';
const OVERLONG_MEMORY = 'x'.repeat(MEMORY_MAX_CHARACTERS + 1);
const APPLIED_TEXT = `Updated ${SESSION_NAME} in Hevy.`;
const KEPT_TEXT = 'Kept as is.';
const NOTHING_PENDING = 'There is nothing to apply.';
const CHOICES = [
  { label: 'Apply changes', value: 'apply' },
  { label: 'Keep as is', value: 'keep' },
];

const squat = (weightKg: number): Exercise => ({
  templateId: TEMPLATE_ID,
  title: TEMPLATE_TITLE,
  sets: SETS,
  reps: REPS,
  weightKg,
  rpe: 8,
  note: 'Brace before you unrack.',
});

const BLOCK: Block = {
  name: 'Autumn block',
  weeks: 4,
  createdAt: '2026-09-01T10:00:00.000Z',
  reason: 'intake answered',
  sessions: [{ name: SESSION_NAME, focus: 'squat and hinge', hevyRoutineId: ROUTINE_ID, exercises: [squat(BEST_KG)] }],
};

const proposalOf = (session: string) => ({ session, summary: SUMMARY, exercises: [squat(PROPOSED_KG)] });

const reviewJson = (proposal: unknown, memory = MEMORY): string =>
  JSON.stringify({ message: REVIEW_TEXT, memory, proposal });

const pending = (exercises: Exercise[], sessionIndex = 0): PendingProposal => ({
  sessionIndex,
  exercises,
  messageId: 'm-review',
});

function anthropicStub(texts: string[]) {
  const fetchImpl: typeof fetch = async () => {
    const text = texts.shift() ?? '';
    const message = { id: 'msg-1', type: 'message', role: 'assistant', model: 'chat-model', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    return new Response(JSON.stringify(message), { status: OK, headers: { 'content-type': 'application/json' } });
  };
  return new Anthropic({ apiKey: 'test', fetch: fetchImpl, maxRetries: 0 });
}

const listed = (key: string, items: unknown[]) => ({ page: 1, page_count: 1, [key]: items });

const workout = {
  id: WORKOUT_ID,
  title: SESSION_NAME,
  routine_id: ROUTINE_ID,
  description: '',
  start_time: '2026-09-10T10:00:00Z',
  end_time: '2026-09-10T11:00:00Z',
  updated_at: '2026-09-10T11:00:00Z',
  created_at: '2026-09-10T11:00:00Z',
  exercises: [{ index: 0, title: TEMPLATE_TITLE, notes: '', exercise_template_id: TEMPLATE_ID, superset_id: null, sets: [{ index: 0, type: 'normal', weight_kg: BEST_KG, reps: REPS, distance_meters: null, duration_seconds: null, rpe: 8, custom_metric: null }] }],
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Keyed by the exact path each client call makes, so an unknown workout id is a real 404. */
function hevyStub() {
  const calls: Call[] = [];
  const routes: Record<string, () => unknown> = {
    [`/v1/workouts/${WORKOUT_ID}`]: () => workout,
    '/v1/workouts': () => listed('workouts', [workout]),
    '/v1/body_measurements': () => listed('body_measurements', []),
    '/v1/exercise_templates': () => listed('exercise_templates', [{ id: TEMPLATE_ID, title: TEMPLATE_TITLE, type: 'weight_reps', primary_muscle_group: 'quadriceps', secondary_muscle_groups: [], equipment: 'barbell', is_custom: false }]),
    '/v1/routine_folders': () => listed('routine_folders', [{ id: FOLDER_ID, index: 0, title: 'HevyCoach', updated_at: '', created_at: '' }]),
    [`/v1/routines/${ROUTINE_ID}`]: () => ({ routine: { id: ROUTINE_ID } }),
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const { pathname } = new URL(String(input));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: pathname, body });
    const route = routes[pathname];
    if (!route) return new Response('not found', { status: NOT_FOUND });
    return new Response(JSON.stringify(route()), { status: OK });
  };

  return { calls, client: createHevyClient({ apiKey: 'test', fetch: fetchImpl, retries: 0 }) };
}

function harness(texts: string[] = [], seed: Partial<State> = {}) {
  const state: State = { ...emptyState(), block: structuredClone(BLOCK), ...seed };
  const hevy = hevyStub();
  const deps: CoachDeps = {
    anthropic: anthropicStub(texts),
    hevy: hevy.client,
    state,
    save: async () => {},
    models: { plan: 'plan-model', chat: 'chat-model' },
    log: () => {},
  };
  const written = () => hevy.calls.filter((call) => call.method !== 'GET');
  return { deps, state, written };
}

describe('review', () => {
  it('should offer the apply and keep choices when the coach proposes a change', async () => {
    const { deps, state } = harness([reviewJson(proposalOf(SESSION_NAME))]);

    await review(deps, WORKOUT_ID);

    expect(state.messages[0].choices).toEqual(CHOICES);
  });

  it('should save the proposal against the session it names', async () => {
    const { deps, state } = harness([reviewJson(proposalOf(SESSION_NAME))]);

    await review(deps, WORKOUT_ID);

    expect(state.pendingProposal).toEqual({ sessionIndex: 0, exercises: [squat(PROPOSED_KG)], messageId: state.messages[0].id });
  });

  it('should fall back to the routine the workout ran when the proposal names no known session', async () => {
    const { deps, state } = harness([reviewJson(proposalOf(OTHER_SESSION_NAME))]);

    await review(deps, WORKOUT_ID);

    expect(state.pendingProposal?.sessionIndex).toBe(0);
  });

  it('should leave the choices off a review that proposes nothing', async () => {
    const { deps, state } = harness([reviewJson(null)]);

    await review(deps, WORKOUT_ID);

    expect(state.messages[0].choices).toBeUndefined();
  });

  it('should clear a proposal still pending when the new review proposes nothing', async () => {
    const { deps, state } = harness([reviewJson(null)], { pendingProposal: pending([squat(PROPOSED_KG)]) });

    await review(deps, WORKOUT_ID);

    expect(state.pendingProposal).toBeNull();
  });

  it('should drop a proposal whose exercises came back malformed', async () => {
    const { deps, state } = harness([reviewJson({ session: SESSION_NAME, summary: SUMMARY, exercises: [{ ...squat(PROPOSED_KG), sets: '3' }] })]);

    await review(deps, WORKOUT_ID);

    expect(state.pendingProposal).toBeNull();
  });

  it('should name the matched session on the review message', async () => {
    const { deps, state } = harness([reviewJson(null)]);

    await review(deps, WORKOUT_ID);

    expect(state.messages[0]).toMatchObject({ kind: 'review', session: SESSION_NAME });
  });

  it('should push the first line of the review', async () => {
    const { deps } = harness([reviewJson(null)]);

    const result = await review(deps, WORKOUT_ID);

    expect(result?.pushBody).toBe(REVIEW_HEADLINE);
  });

  it('should truncate a memory that came back longer than the documented bound', async () => {
    const { deps, state } = harness([reviewJson(null, OVERLONG_MEMORY)]);

    await review(deps, WORKOUT_ID);

    expect(state.memory).toHaveLength(MEMORY_MAX_CHARACTERS);
  });

  it('should return nothing when the workout cannot be fetched', async () => {
    const { deps } = harness([reviewJson(null)]);

    expect(await review(deps, MISSING_WORKOUT_ID)).toBeNull();
  });
});

describe('applyProposal', () => {
  it('should update the proposed session in Hevy and nothing else', async () => {
    const { deps, written } = harness([], { pendingProposal: pending([squat(PROPOSED_KG)]) });

    await applyProposal(deps);

    expect(written()).toEqual([
      {
        method: 'PUT',
        path: `/v1/routines/${ROUTINE_ID}`,
        body: {
          routine: {
            title: SESSION_NAME,
            exercises: [
              {
                exercise_template_id: TEMPLATE_ID,
                notes: 'RPE 8. Brace before you unrack.',
                sets: Array.from({ length: SETS }, () => ({ type: 'normal', weight_kg: PROPOSED_KG, reps: REPS })),
              },
            ],
          },
        },
      },
    ]);
  });

  it('should write the proposed exercises into the block', async () => {
    const { deps, state } = harness([], { pendingProposal: pending([squat(PROPOSED_KG)]) });

    await applyProposal(deps);

    expect(state.block?.sessions[0].exercises).toEqual([squat(PROPOSED_KG)]);
  });

  it('should clear the proposal and confirm the session by name', async () => {
    const { deps, state } = harness([], { pendingProposal: pending([squat(PROPOSED_KG)]) });

    const message = await applyProposal(deps);

    expect([message.text, message.kind, state.pendingProposal]).toEqual([APPLIED_TEXT, undefined, null]);
  });

  it('should write nothing when the proposal breaks the guard', async () => {
    const { deps, written } = harness([], { pendingProposal: pending([squat(OVER_CAP_KG)]) });

    await applyProposal(deps);

    expect(written()).toEqual([]);
  });

  it('should say which bound the rejected proposal broke', async () => {
    const { deps } = harness([], { pendingProposal: pending([squat(OVER_CAP_KG)]) });

    const message = await applyProposal(deps);

    expect(message.text).toContain(`${TEMPLATE_TITLE}: weightKg ${OVER_CAP_KG} is above the ${CAP_KG} kg cap`);
  });

  it('should drop a proposal the guard rejected', async () => {
    const { deps, state } = harness([], { pendingProposal: pending([squat(OVER_CAP_KG)]) });

    await applyProposal(deps);

    expect(state.pendingProposal).toBeNull();
  });

  it('should say there is nothing to apply when the block no longer holds that session', async () => {
    const { deps, written } = harness([], { pendingProposal: pending([squat(PROPOSED_KG)], 4) });

    const message = await applyProposal(deps);

    expect([message.text, written()]).toEqual([NOTHING_PENDING, []]);
  });
});

describe('discardProposal', () => {
  it('should clear the proposal and say the session stands', async () => {
    const { deps, state } = harness([], { pendingProposal: pending([squat(PROPOSED_KG)]) });

    const message = await discardProposal(deps);

    expect([message.text, state.pendingProposal]).toEqual([KEPT_TEXT, null]);
  });
});
