import Anthropic from '@anthropic-ai/sdk';
import { createHevyClient, type Workout, type WorkoutExercise } from '@furkantanyol/hevy-client';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CoachDeps } from './coach.js';
import { SUMMARY_TTL_MS } from './derived.js';
import { buildApp, type RouteDeps } from './routes.js';
import { type Block, emptyState, type Message, type Profile, type Session, type State } from './state.js';

process.env.LOG_LEVEL = 'silent';

const APP_TOKEN = 'app-token';
const OK = 200;
const BAD_REQUEST = 400;

type Headers = Record<string, string>;

const appAuth: Headers = { authorization: `Bearer ${APP_TOKEN}` };

const get = (app: FastifyInstance, url: string, headers?: Headers) =>
  app.inject({ method: 'GET', url, headers });
const put = (app: FastifyInstance, url: string, payload: object, headers?: Headers) =>
  app.inject({ method: 'PUT', url, payload, headers });

const offline: typeof fetch = async () => {
  throw new Error('the coach must not reach the network in these tests');
};

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

function harness(overrides: Partial<RouteDeps> = {}, seed: Partial<State> = {}, hevy: typeof fetch = offline) {
  const state: State = { ...emptyState(), ...seed };
  let saves = 0;
  const deps: RouteDeps = {
    state,
    save: async () => {
      saves += 1;
    },
    coach: coachDeps(state, hevy),
    appToken: APP_TOKEN,
    pushToken: () => state.pushToken,
    ...overrides,
  };
  return { app: buildApp(deps), state, saves: () => saves };
}

const message: Message = {
  id: 'm1',
  role: 'assistant',
  text: 'Solid session.',
  createdAt: '2026-09-10T10:00:00.000Z',
  kind: 'verdict',
};

const PREFILL = '/prefill';
const PROFILE = '/profile';
const BLOCK = '/block';
const PROGRESS = '/progress';
const WORKOUTS_PATH = '/v1/workouts';
const MEASUREMENTS_PATH = '/v1/body_measurements';
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const SESSION_MINUTES = 75;
const BODYWEIGHT_KG = 78.4;

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

const squat: WorkoutExercise = { index: 0, title: 'Squat (Barbell)', notes: '', exercise_template_id: 'SQ', superset_id: null, sets: [] };

function loggedWorkout(daysAgo: number, routineId: string | null): Workout {
  const start = Date.now() - daysAgo * MS_PER_DAY;
  const startedAt = iso(start);
  return { id: `w-${daysAgo}`, title: 'Lower A', routine_id: routineId, description: '', start_time: startedAt, end_time: iso(start + SESSION_MINUTES * MS_PER_MINUTE), updated_at: startedAt, created_at: startedAt, exercises: [squat] };
}

/** Serves the two endpoints the derived routes read, and counts what each of them was asked for. */
function hevyFetch(workouts: Workout[]) {
  const paths: string[] = [];
  const impl: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    const body =
      path === WORKOUTS_PATH
        ? { page: 1, page_count: 1, workouts }
        : { page: 1, page_count: 1, body_measurements: [{ date: iso(Date.now()), weight_kg: BODYWEIGHT_KG }] };
    return new Response(JSON.stringify(body), { status: OK });
  };
  return { impl, hits: (path: string) => paths.filter((seen) => seen === path).length };
}

const profile: Profile = {
  sex: 'male',
  age: 32,
  heightCm: 183,
  bodyweightKg: 84,
  goals: ['muscle', 'strength'],
  daysPerWeek: 4,
  sessionMinutes: SESSION_MINUTES,
  yearsTraining: '3-5',
  equipment: 'full_gym',
  trainingStyle: 'hybrid',
  cardio: 'zone2',
  injuries: ['knee'],
  notes: 'Left knee aches on deep squats.',
};

const blockSession = (name: string, hevyRoutineId: string): Session => ({ name, focus: 'lower', hevyRoutineId, exercises: [] });
const block: Block = { name: 'Block A', weeks: 4, sessions: [blockSession('1 Push', 'r-push'), blockSession('2 Pull', 'r-pull')], createdAt: '2026-09-01T10:00:00.000Z', reason: 'intake' };

describe('GET /prefill', () => {
  it('should derive every onboarding default from the Hevy history', async () => {
    const workouts = [loggedWorkout(1, null), loggedWorkout(3, null)];
    const { app } = harness({}, {}, hevyFetch(workouts).impl);

    const response = await get(app, PREFILL, appAuth);

    expect(response.json()).toEqual({
      bodyweightKg: BODYWEIGHT_KG,
      daysPerWeek: 1,
      sessionMinutes: SESSION_MINUTES,
      yearsTraining: '<1',
      equipment: 'full_gym',
      workouts: 2,
      firstWorkout: workouts[1].start_time,
    });
  });

  it('should report every default as absent for an empty account', async () => {
    const { app } = harness({}, {}, hevyFetch([]).impl);

    const response = await get(app, PREFILL, appAuth);

    expect(response.json()).toMatchObject({ bodyweightKg: BODYWEIGHT_KG, daysPerWeek: null, sessionMinutes: null, yearsTraining: null, equipment: null, workouts: 0 });
  });
});

describe('GET /profile', () => {
  it('should report no profile before onboarding has saved one', async () => {
    const { app } = harness();

    expect((await get(app, PROFILE, appAuth)).json()).toEqual({ profile: null });
  });

  it('should return the profile held in state', async () => {
    const { app } = harness({}, { profile });

    expect((await get(app, PROFILE, appAuth)).json()).toEqual({ profile });
  });
});

describe('PUT /profile', () => {
  it('should answer with the profile it accepted', async () => {
    const { app } = harness();

    const response = await put(app, PROFILE, profile, appAuth);

    expect([response.statusCode, response.json()]).toEqual([OK, { profile }]);
  });

  it('should save the accepted profile into state', async () => {
    const { app, state, saves } = harness();

    await put(app, PROFILE, profile, appAuth);

    expect([state.profile, saves()]).toEqual([profile, 1]);
  });

  it('should name the field that failed validation', async () => {
    const { app } = harness();

    const response = await put(app, PROFILE, { ...profile, daysPerWeek: 9 }, appAuth);

    expect([response.statusCode, response.json()]).toEqual([
      BAD_REQUEST,
      { error: 'daysPerWeek must be a number between 1 and 7' },
    ]);
  });

  it('should name a field whose union value is unknown', async () => {
    const { app } = harness();

    const response = await put(app, PROFILE, { ...profile, trainingStyle: 'crossfit' }, appAuth);

    expect(response.json().error).toMatch(/^trainingStyle must be one of /);
  });

  it('should leave state untouched when the profile is rejected', async () => {
    const { app, state, saves } = harness();

    await put(app, PROFILE, { ...profile, age: 11 }, appAuth);

    expect([state.profile, saves()]).toEqual([null, 0]);
  });
});

describe('GET /block', () => {
  it('should report the completed session, its verdict and the session that follows', async () => {
    const workouts = [loggedWorkout(2, 'r-push')];
    const messages: Message[] = [{ ...message, text: 'Strong squats.', session: '1 Push' }];
    const { app } = harness({}, { block, messages }, hevyFetch(workouts).impl);

    const response = await get(app, BLOCK, appAuth);

    expect(response.json()).toEqual({
      block,
      nextSessionIndex: 1,
      completions: { 0: { completedAt: workouts[0].end_time, verdict: 'Strong squats.' } },
    });
  });

  it('should report no block before the coach has written one', async () => {
    const { app } = harness({}, {}, hevyFetch([]).impl);

    expect((await get(app, BLOCK, appAuth)).json()).toEqual({
      block: null,
      nextSessionIndex: null,
      completions: {},
    });
  });
});

describe('GET /progress', () => {
  it('should report the workout span and the count since Monday', async () => {
    const workouts = [loggedWorkout(0, null)];
    const { app } = harness({}, {}, hevyFetch(workouts).impl);

    const response = await get(app, PROGRESS, appAuth);

    expect(response.json()).toMatchObject({
      workouts: 1,
      firstWorkout: workouts[0].start_time,
      lastWorkout: workouts[0].start_time,
      thisWeek: 1,
    });
  });

  it('should list the lifts the history holds', async () => {
    const { app } = harness({}, {}, hevyFetch([loggedWorkout(0, null)]).impl);

    const response = await get(app, PROGRESS, appAuth);

    expect(response.json().lifts).toEqual([
      expect.objectContaining({ templateId: 'SQ', title: 'Squat (Barbell)', sessions: 1 }),
    ]);
  });
});

describe('the history summary cache', () => {
  const twoReads = async (elapsedMs: number) => {
    const hevy = hevyFetch([loggedWorkout(0, null)]);
    let clock = 0;
    const { app } = harness({ now: () => clock }, {}, hevy.impl);

    await get(app, PROGRESS, appAuth);
    clock = elapsedMs;
    await get(app, PREFILL, appAuth);

    return hevy.hits(MEASUREMENTS_PATH);
  };

  it('should not read the summary again inside the window', async () => {
    expect(await twoReads(SUMMARY_TTL_MS - 1)).toBe(1);
  });

  it('should read the summary again once the window has elapsed', async () => {
    expect(await twoReads(SUMMARY_TTL_MS)).toBe(2);
  });
});
