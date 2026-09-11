import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient, type Workout, type WorkoutExercise, type WorkoutSet } from 'hevy-sdk';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CoachDeps } from './coach.js';
import type { CardsView } from './derived.js';
import { buildApp, type RouteDeps } from './routes.js';
import { type Block, emptyState, type Exercise, type Message, type Session, type State } from './state.js';

process.env.LOG_LEVEL = 'silent';

const APP_TOKEN = 'app-token';
const OK = 200;
const MESSAGES = '/messages';
const CARDS = '/cards';
const WORKOUTS_PATH = '/v1/workouts';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const SESSION_MINUTES = 75;
const BODYWEIGHT_KG = 78.4;
const WORKOUT_TITLE = 'Lower A';
const SQUAT_TITLE = 'Squat (Barbell)';

type Headers = Record<string, string>;

const appAuth: Headers = { authorization: `Bearer ${APP_TOKEN}` };

const get = (app: FastifyInstance, url: string, headers?: Headers) =>
  app.inject({ method: 'GET', url, headers });

const offline: typeof fetch = async () => {
  throw new Error('the coach must not reach the network in these tests');
};

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

const workingSet: WorkoutSet = { index: 1, type: 'normal', weight_kg: 100, reps: 5, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null };
const warmupSet: WorkoutSet = { ...workingSet, index: 0, type: 'warmup', weight_kg: 60, reps: 10 };
const squat: WorkoutExercise = { index: 0, title: SQUAT_TITLE, notes: '', exercise_template_id: 'SQ', superset_id: null, sets: [warmupSet, workingSet] };

function loggedWorkout(daysAgo: number, routineId: string | null): Workout {
  const start = Date.now() - daysAgo * MS_PER_DAY;
  const startedAt = iso(start);
  return { id: `w-${daysAgo}`, title: WORKOUT_TITLE, routine_id: routineId, description: '', start_time: startedAt, end_time: iso(start + SESSION_MINUTES * MS_PER_MINUTE), updated_at: startedAt, created_at: startedAt, exercises: [squat] };
}

/** Serves the two endpoints the history reads, so the opener and the cards see a real account. */
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

const pressExercise: Exercise = { templateId: 'OHP', title: 'Overhead Press (Barbell)', sets: 3, reps: 5, weightKg: 50, rpe: 8, note: '' };
const blockSession = (name: string, hevyRoutineId: string, exercises: Exercise[] = []): Session => ({ name, focus: 'lower', hevyRoutineId, exercises });
const block: Block = { name: 'Block A', weeks: 4, sessions: [blockSession('Day 1 - Heavy Lower', 'r-lower'), blockSession('Day 2 - Heavy Upper', 'r-upper', [pressExercise])], createdAt: '2026-09-01T10:00:00.000Z', reason: 'intake' };

describe('GET /messages', () => {
  it('should open the thread with the welcome and the first question', async () => {
    const { app } = harness({}, hevyFetch([loggedWorkout(1, null), loggedWorkout(3, null)]));

    const messages = (await get(app, MESSAGES, appAuth)).json();

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        text: "I'm your coach on top of Hevy. I've read your 2 workouts, too few to read your habits from yet, so a few questions first, then I'll write your first block into Hevy.\n\nHow long have you been training?",
      }),
    ]);
  });

  it('should offer the years as choices under the opener when nothing is logged', async () => {
    const { app } = harness({}, hevyFetch([]));

    const messages = (await get(app, MESSAGES, appAuth)).json<Message[]>();

    expect(messages[0].choices).toEqual([
      { label: 'Less than a year', value: '<1' },
      { label: '1 to 3 years', value: '1-3' },
      { label: '3 to 5 years', value: '3-5' },
      { label: '5 years or more', value: '5+' },
    ]);
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

describe('GET /cards', () => {
  it('should report the week volume, the last workout and the session that follows it', async () => {
    const workouts = [loggedWorkout(0, 'r-lower')];
    const { app } = harness({ block }, hevyFetch(workouts));

    const cards = (await get(app, CARDS, appAuth)).json<CardsView>();

    expect(cards).toMatchObject({
      weekVolume: { totalKg: 500, sessions: 1 },
      lastWorkout: {
        title: WORKOUT_TITLE,
        at: workouts[0].start_time,
        lifts: [{ title: SQUAT_TITLE, sets: 1, reps: 5, weightKg: 100, volumeKg: 500 }],
      },
      nextSession: { name: 'Day 2 - Heavy Upper', exercises: ['Overhead Press (Barbell)'] },
    });
  });

  it('should draw the seven bars of the week from Monday', async () => {
    const { app } = harness({ block }, hevyFetch([loggedWorkout(0, 'r-lower')]));

    const cards = (await get(app, CARDS, appAuth)).json<CardsView>();

    expect(cards.weekVolume.byDay.map((bar) => bar.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('should report an empty week and no cards before the coach has written a block', async () => {
    const { app } = harness({}, hevyFetch([]));

    const cards = (await get(app, CARDS, appAuth)).json<CardsView>();

    expect([cards.weekVolume.totalKg, cards.lastWorkout, cards.nextSession]).toEqual([0, null, null]);
  });
});
