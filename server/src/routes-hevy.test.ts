import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient, type Workout, type WorkoutExercise } from '@furkantanyol/hevy-client';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CoachDeps } from './coach.js';
import { buildApp, type RouteDeps } from './routes.js';
import { type Block, emptyState, type Message, type Session, type State } from './state.js';

process.env.LOG_LEVEL = 'silent';

const APP_TOKEN = 'app-token';
const OK = 200;
const MESSAGES = '/messages';
const WEEK = '/week';
const WORKOUTS_PATH = '/v1/workouts';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const SESSION_MINUTES = 75;
const BODYWEIGHT_KG = 78.4;
const WORKOUT_TITLE = 'Lower A';

type Headers = Record<string, string>;

const appAuth: Headers = { authorization: `Bearer ${APP_TOKEN}` };

const get = (app: FastifyInstance, url: string, headers?: Headers) =>
  app.inject({ method: 'GET', url, headers });

const offline: typeof fetch = async () => {
  throw new Error('the coach must not reach the network in these tests');
};

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

const squat: WorkoutExercise = { index: 0, title: 'Squat (Barbell)', notes: '', exercise_template_id: 'SQ', superset_id: null, sets: [] };

function loggedWorkout(daysAgo: number, routineId: string | null): Workout {
  const start = Date.now() - daysAgo * MS_PER_DAY;
  const startedAt = iso(start);
  return { id: `w-${daysAgo}`, title: WORKOUT_TITLE, routine_id: routineId, description: '', start_time: startedAt, end_time: iso(start + SESSION_MINUTES * MS_PER_MINUTE), updated_at: startedAt, created_at: startedAt, exercises: [squat] };
}

/** Serves the two endpoints the history reads, so the opener and the week strip see a real account. */
function hevyFetch(workouts: Workout[]): typeof fetch {
  return async (input) => {
    const path = new URL(String(input)).pathname;
    const body =
      path === WORKOUTS_PATH
        ? { page: 1, page_count: 1, workouts }
        : { page: 1, page_count: 1, body_measurements: [{ date: iso(Date.now()), weight_kg: BODYWEIGHT_KG }] };
    return new Response(JSON.stringify(body), { status: OK });
  };
}

function coachDeps(state: State, hevy: typeof fetch): CoachDeps {
  return {
    anthropic: new Anthropic({ apiKey: 'test', fetch: offline, maxRetries: 0 }),
    hevy: createHevyClient({ apiKey: 'test', fetch: hevy, retries: 0 }),
    state,
    save: async () => {},
    models: { plan: 'plan-model', chat: 'chat-model' },
    log: () => {},
  };
}

function harness(seed: Partial<State> = {}, hevy: typeof fetch = offline) {
  const state: State = { ...emptyState(), ...seed };
  const deps: RouteDeps = {
    state,
    save: async () => {},
    coach: coachDeps(state, hevy),
    appToken: APP_TOKEN,
    pushToken: () => state.pushToken,
  };
  return { app: buildApp(deps), state };
}

const blockSession = (name: string, hevyRoutineId: string): Session => ({ name, focus: 'lower', hevyRoutineId, exercises: [] });
const block: Block = { name: 'Block A', weeks: 4, sessions: [blockSession('Day 1 - Heavy Lower', 'r-lower'), blockSession('Day 2 - Heavy Upper', 'r-upper')], createdAt: '2026-09-01T10:00:00.000Z', reason: 'intake' };

describe('GET /messages', () => {
  it('should open the thread with the welcome and the first question', async () => {
    const { app } = harness({}, hevyFetch([loggedWorkout(1, null), loggedWorkout(3, null)]));

    const messages = (await get(app, MESSAGES, appAuth)).json();

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        text: "I'm your coach on top of Hevy. I've read your 2 workouts. A few questions, then I'll write your first block into Hevy.\n\nWhat are you training for?",
        multi: true,
      }),
    ]);
  });

  it('should offer the goals as choices under the opener', async () => {
    const { app } = harness({}, hevyFetch([]));

    const messages = (await get(app, MESSAGES, appAuth)).json();

    expect(messages[0].choices[0]).toEqual({ label: 'Muscle', value: 'muscle' });
  });

  it('should append the opener once however often the thread is loaded', async () => {
    const { app, state } = harness({}, hevyFetch([]));

    await get(app, MESSAGES, appAuth);
    await get(app, MESSAGES, appAuth);

    expect(state.messages).toHaveLength(1);
  });

  it('should leave a thread that already has messages alone', async () => {
    const messages: Message[] = [{ id: 'm1', role: 'assistant', text: 'Solid session.', createdAt: '2026-09-10T10:00:00.000Z' }];
    const { app, state } = harness({ messages }, hevyFetch([]));

    await get(app, MESSAGES, appAuth);

    expect([state.messages.length, state.intake]).toEqual([1, null]);
  });
});

describe('GET /week', () => {
  it('should count this week, name the last workout and the session that follows it', async () => {
    const workouts = [loggedWorkout(0, 'r-lower')];
    const { app } = harness({ block }, hevyFetch(workouts));

    const response = await get(app, WEEK, appAuth);

    expect(response.json()).toEqual({
      workoutsThisWeek: 1,
      lastWorkout: { title: WORKOUT_TITLE, at: workouts[0].start_time },
      nextSession: 'Day 2 - Heavy Upper',
    });
  });

  it('should report an empty week and no next session before the coach has written a block', async () => {
    const { app } = harness({}, hevyFetch([]));

    expect((await get(app, WEEK, appAuth)).json()).toEqual({
      workoutsThisWeek: 0,
      lastWorkout: null,
      nextSession: null,
    });
  });
});
