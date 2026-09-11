import { createHevyClient, type Workout, type WorkoutExercise, type WorkoutSet } from 'hevy-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ExerciseHistory, findSession, formatCatalogue, formatHistory, formatWorkout, type HistorySummary, historySummary, PER_GROUP, ROUTINE_FOLDER, templateCatalogue, TOP_EXERCISES, writeRoutines } from './hevy.js';
import { currentRoutines, formatRoutines } from './routines.js';
import type { Block, Session } from './state.js';

const NOW = '2026-09-10T12:00:00.000Z';
const HISTORY_CHAR_BUDGET = 16_000;
const FOLDER_ID = 7;
const OK = 200;
const NOT_FOUND = 404;
const SETS_PER_EXERCISE = 3;

interface Call { method: string; path: string; query: Record<string, string>; body: unknown }

type Route = (call: Call) => unknown;

const listed = (key: string, items: unknown[], pageCount = 1) => ({ page: 1, page_count: pageCount, [key]: items });

function harness(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const table: Record<string, Route> = { '/v1/body_measurements': () => listed('body_measurements', []), ...routes };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: Call = { method: init?.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), body };
    calls.push(call);
    const route = Object.entries(table).find(([path]) => call.path === path || call.path.startsWith(`${path}/`))?.[1];
    if (!route) return new Response('not found', { status: NOT_FOUND });
    const answer = route(call);
    return answer instanceof Response ? answer : new Response(JSON.stringify(answer), { status: OK });
  };
  return { calls, client: createHevyClient({ apiKey: 'test', fetch: fetchImpl, retries: 0 }) };
}

const writes = (calls: Call[]) => calls.filter((call) => call.method !== 'GET').map(({ method, path, body }) => ({ method, path, body }));

const BASE_SET: WorkoutSet = { index: 0, type: 'normal', weight_kg: 0, reps: 0, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null };
const set = (weightKg: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ ...BASE_SET, weight_kg: weightKg, reps, ...extra });
const exercise = (templateId: string, title: string, sets: WorkoutSet[]): WorkoutExercise => ({ index: 0, title, notes: '', exercise_template_id: templateId, superset_id: null, sets });
const squat = (sets: WorkoutSet[]) => exercise('SQ', 'Squat (Barbell)', sets);
const workout = (startTime: string, exercises: WorkoutExercise[], extra: Partial<Workout> = {}): Workout => ({ id: `w-${startTime}`, title: 'Lower A', routine_id: null, description: '', start_time: startTime, end_time: startTime, updated_at: startTime, created_at: startTime, exercises, ...extra });
const template = (id: string, muscleGroup: string) => ({ id, title: `Lift ${id}`, type: 'weight_reps', primary_muscle_group: muscleGroup, secondary_muscle_groups: [], equipment: 'barbell', is_custom: false });
const historyExercise = (id: string, extra: Partial<ExerciseHistory> = {}): ExerciseHistory => ({ templateId: id, title: `Lift ${id}`, sessions: 12, lastPerformed: '2026-09-07T10:00:00Z', bestWeightKg: 100, bestReps: 5, e1rmTrend: [110, 115, 120], weeklyFrequency: 1.5, ...extra });
const summaryOf = (exercises: ExerciseHistory[]): HistorySummary => ({ workouts: 30, firstWorkout: '2026-01-02T10:00:00Z', lastWorkout: '2026-09-07T10:00:00Z', latestBodyweightKg: 78.4, exercises });
const session = (name: string, hevyRoutineId: string | null): Session => ({ name, focus: 'lower', hevyRoutineId, exercises: [{ templateId: 'SQ', title: 'Squat (Barbell)', sets: SETS_PER_EXERCISE, reps: 5, weightKg: 100, rpe: 8, note: 'Bar over midfoot.' }] });
const blockOf = (sessions: Session[]): Block => ({ name: 'Block A', weeks: 4, sessions, createdAt: NOW, reason: 'intake' });
const folder = (id: number) => ({ id, index: 0, title: ROUTINE_FOLDER, updated_at: NOW, created_at: NOW });

const ROUTINE_EXERCISE = { exercise_template_id: 'SQ', notes: 'RPE 8. Bar over midfoot.', sets: Array.from({ length: SETS_PER_EXERCISE }, () => ({ type: 'normal', weight_kg: 100, reps: 5 })) };
const createdRoutine = (title: string, folderId: number) => ({ method: 'POST', path: '/v1/routines', body: { routine: { title, folder_id: folderId, exercises: [ROUTINE_EXERCISE] } } });

function routineRoutes(folders: unknown[]): Record<string, Route> {
  let created = 0;
  return {
    '/v1/routine_folders': (call) => (call.method === 'POST' ? folder(FOLDER_ID) : listed('routine_folders', folders)),
    '/v1/routines': (call) => ({ routine: { id: call.method === 'POST' ? `r-new-${++created}` : call.path.split('/').at(-1) } }),
  };
}

function freezeClock(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('historySummary', () => {
  it('should fetch every page until page_count is exhausted', async () => {
    const pages: Record<string, Workout[]> = {
      '1': [workout('2026-09-01T10:00:00Z', [squat([set(100, 5)])])],
      '2': [workout('2026-09-03T10:00:00Z', [squat([set(102.5, 5)])])],
    };
    const { client, calls } = harness({ '/v1/workouts': (call) => listed('workouts', pages[call.query.page] ?? [], 2) });

    const summary = await historySummary(client);

    expect(calls.filter((call) => call.path === '/v1/workouts').map((call) => call.query)).toEqual([
      { page: '1', pageSize: '10' },
      { page: '2', pageSize: '10' },
    ]);
    expect(summary.workouts).toBe(2);
  });

  it('should aggregate sessions, the best set and the weekly frequency per exercise', async () => {
    freezeClock();
    const workouts = [
      workout('2026-07-20T10:00:00Z', [squat([set(90, 5)])]),
      workout('2026-08-25T10:00:00Z', [squat([set(100, 5), set(110, 3)])]),
      workout('2026-09-07T10:00:00Z', [squat([set(105, 8)])]),
    ];
    const { client } = harness({ '/v1/workouts': () => listed('workouts', workouts) });

    const summary = await historySummary(client);

    expect(summary.exercises).toEqual([
      {
        templateId: 'SQ',
        title: 'Squat (Barbell)',
        sessions: 3,
        lastPerformed: '2026-09-07T10:00:00Z',
        bestWeightKg: 110,
        bestReps: 3,
        e1rmTrend: [105, 121, 133],
        weeklyFrequency: 0.5,
      },
    ]);
  });

  it('should keep only the last three e1rm estimates, oldest first', async () => {
    const workouts = [60, 70, 80, 90].map((weightKg, index) => workout(`2026-08-0${index + 1}T10:00:00Z`, [squat([set(weightKg, 10)])]));
    const { client } = harness({ '/v1/workouts': () => listed('workouts', workouts) });

    const summary = await historySummary(client);

    expect(summary.exercises[0].e1rmTrend).toEqual([93.3, 106.7, 120]);
  });

  it('should ignore warmup sets when picking the best set', async () => {
    const workouts = [workout('2026-09-01T10:00:00Z', [squat([set(140, 1, { type: 'warmup' }), set(100, 5)])])];
    const { client } = harness({ '/v1/workouts': () => listed('workouts', workouts) });

    const summary = await historySummary(client);

    expect(summary.exercises[0].bestWeightKg).toBe(100);
  });

  it('should keep every exercise in the history, not only the ones the prompt shows', async () => {
    const exercises = Array.from({ length: TOP_EXERCISES + 1 }, (_, index) => exercise(`E${index}`, `Lift ${index}`, [set(50, 5)]));
    const { client } = harness({ '/v1/workouts': () => listed('workouts', [workout('2026-09-01T10:00:00Z', exercises)]) });

    expect((await historySummary(client)).exercises).toHaveLength(TOP_EXERCISES + 1);
  });

  it('should report the latest bodyweight measurement', async () => {
    const measurements = [
      { id: 1, date: '2026-09-01', weight_kg: 80, created_at: NOW },
      { id: 2, date: '2026-09-08', weight_kg: 78.4, created_at: NOW },
    ];
    const { client } = harness({
      '/v1/workouts': () => listed('workouts', []),
      '/v1/body_measurements': () => listed('body_measurements', measurements),
    });

    await expect(historySummary(client)).resolves.toMatchObject({ latestBodyweightKg: 78.4 });
  });

  it('should return an empty summary when nothing is logged', async () => {
    const { client } = harness({ '/v1/workouts': () => listed('workouts', []) });

    await expect(historySummary(client)).resolves.toEqual({
      workouts: 0,
      firstWorkout: null,
      lastWorkout: null,
      latestBodyweightKg: null,
      exercises: [],
    });
  });
});

describe('formatHistory', () => {
  it('should write one line per exercise after the header', () => {
    const text = formatHistory(summaryOf([historyExercise('A'), historyExercise('B')]));

    expect(text.split('\n')).toEqual([
      'Workouts: 30 (2026-01-02 to 2026-09-07). Bodyweight: 78.4 kg.',
      'Lift A [A]: 12 sessions, last 2026-09-07, best 100kg x 5, e1rm 110 > 115 > 120, 1.5/wk',
      'Lift B [B]: 12 sessions, last 2026-09-07, best 100kg x 5, e1rm 110 > 115 > 120, 1.5/wk',
    ]);
  });

  it('should trim to TOP_EXERCISES so a longer history still fits the prompt budget', () => {
    const exercises = Array.from({ length: TOP_EXERCISES + 5 }, (_, index) => historyExercise(`E${index}`));

    const text = formatHistory(summaryOf(exercises));

    expect(text.split('\n')).toHaveLength(TOP_EXERCISES + 1);
    expect(text.length).toBeLessThan(HISTORY_CHAR_BUDGET);
  });

  it('should say the bodyweight is unknown when there is none', () => {
    const text = formatHistory({ ...summaryOf([]), latestBodyweightKg: null });

    expect(text).toContain('Bodyweight: unknown.');
  });
});

describe('templateCatalogue', () => {
  it('should list the templates the user has used first', async () => {
    const templates = [template('BP', 'chest'), template('SQ', 'quadriceps')];
    const { client } = harness({ '/v1/exercise_templates': () => listed('exercise_templates', templates) });

    const catalogue = await templateCatalogue(client, summaryOf([historyExercise('SQ')]));

    expect(catalogue[0]).toEqual({ id: 'SQ', title: 'Lift SQ', muscleGroup: 'quadriceps', equipment: 'barbell' });
  });

  it('should add at most PER_GROUP further templates per muscle group', async () => {
    const templates = Array.from({ length: PER_GROUP + 8 }, (_, index) => template(`C${index}`, 'chest'));
    const { client } = harness({ '/v1/exercise_templates': () => listed('exercise_templates', [...templates, template('L1', 'lats')]) });

    const catalogue = await templateCatalogue(client, summaryOf([]));

    expect(catalogue.filter((option) => option.muscleGroup === 'chest')).toHaveLength(PER_GROUP);
  });

  it('should keep a used template that the catalogue no longer knows', async () => {
    const { client } = harness({ '/v1/exercise_templates': () => listed('exercise_templates', []) });

    const catalogue = await templateCatalogue(client, summaryOf([historyExercise('GONE')]));

    expect(catalogue).toEqual([{ id: 'GONE', title: 'Lift GONE', muscleGroup: 'unknown', equipment: 'unknown' }]);
  });
});

describe('formatCatalogue', () => {
  it('should write one line per muscle group', () => {
    const catalogue = [
      { id: 'BP', title: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell' },
      { id: 'DB', title: 'DB Press', muscleGroup: 'chest', equipment: 'dumbbell' },
      { id: 'SQ', title: 'Squat', muscleGroup: 'quadriceps', equipment: 'barbell' },
    ];

    expect(formatCatalogue(catalogue)).toBe('chest: Bench Press [BP] (barbell); DB Press [DB] (dumbbell)\nquadriceps: Squat [SQ] (barbell)');
  });
});

describe('writeRoutines', () => {
  it('should create the folder once and one routine per new session', async () => {
    const { client, calls } = harness(routineRoutes([]));

    await writeRoutines(client, blockOf([session('Lower A', null), session('Upper B', null)]));

    expect(writes(calls)).toEqual([
      { method: 'POST', path: '/v1/routine_folders', body: { routine_folder: { title: ROUTINE_FOLDER } } },
      createdRoutine('Lower A', FOLDER_ID),
      createdRoutine('Upper B', FOLDER_ID),
    ]);
  });

  it('should reuse the existing Coach folder', async () => {
    const { client, calls } = harness(routineRoutes([folder(42)]));

    await writeRoutines(client, blockOf([session('Lower A', null)]));

    expect(writes(calls)).toEqual([createdRoutine('Lower A', 42)]);
  });

  it('should update in place when the session already carries a routine id', async () => {
    const { client, calls } = harness(routineRoutes([folder(42)]));

    await writeRoutines(client, blockOf([session('Lower A', 'r-1')]));

    expect(writes(calls)).toEqual([
      { method: 'PUT', path: '/v1/routines/r-1', body: { routine: { title: 'Lower A', folder_id: 42, exercises: [ROUTINE_EXERCISE] } } },
    ]);
  });

  it('should return the block with every routine id filled', async () => {
    const { client } = harness(routineRoutes([]));

    const written = await writeRoutines(client, blockOf([session('Lower A', null), session('Upper B', 'r-1')]));

    expect(written.sessions.map((entry) => entry.hevyRoutineId)).toEqual(['r-new-1', 'r-1']);
  });
});

const routineOf = (id: string, title: string, sets: { type: string; weight_kg: number; reps: number }[]) => ({
  id,
  title,
  folder_id: null,
  updated_at: NOW,
  created_at: NOW,
  exercises: [{ index: 0, title: 'Squat (Barbell)', notes: '', exercise_template_id: 'SQ', superset_id: null, sets }],
});

describe('currentRoutines', () => {
  const routines: Record<string, unknown> = {
    'r-a': routineOf('r-a', 'Lower A', [{ type: 'normal', weight_kg: 100, reps: 5 }]),
    'r-b': routineOf('r-b', 'Upper A', [{ type: 'normal', weight_kg: 60, reps: 8 }]),
  };
  const byId: Route = (call) => {
    const routine = routines[call.path.split('/').at(-1) ?? ''];
    if (!routine) throw new Error('unknown routine');
    return { routine };
  };
  const logged = (startTime: string, routineId: string | null) => workout(startTime, [], { routine_id: routineId });

  it('should fetch each routine behind the recent workouts once, newest first', async () => {
    const { client, calls } = harness({ '/v1/routines': byId });
    const recent = [logged('2026-09-09T10:00:00Z', 'r-b'), logged('2026-09-07T10:00:00Z', 'r-a'), logged('2026-09-05T10:00:00Z', 'r-b')];

    const found = await currentRoutines(client, recent);

    expect([found.map((routine) => routine.id), calls.length]).toEqual([['r-b', 'r-a'], 2]);
  });

  it('should skip workouts logged without a routine', async () => {
    const { client } = harness({ '/v1/routines': byId });

    const found = await currentRoutines(client, [logged('2026-09-09T10:00:00Z', null)]);

    expect(found).toEqual([]);
  });

  it('should leave out a routine Hevy no longer returns', async () => {
    const { client } = harness({ '/v1/routines/r-a': () => ({ routine: routines['r-a'] }) });
    const recent = [logged('2026-09-09T10:00:00Z', 'r-gone'), logged('2026-09-07T10:00:00Z', 'r-a')];

    const found = await currentRoutines(client, recent);

    expect(found.map((routine) => routine.id)).toEqual(['r-a']);
  });

  it('should fail rather than continue from a partial list when Hevy errors', async () => {
    const { client } = harness({ '/v1/routines': byId });

    await expect(currentRoutines(client, [logged('2026-09-09T10:00:00Z', 'r-broken')])).rejects.toThrow();
  });
});

describe('formatRoutines', () => {
  it('should print each routine with its working sets as reps x kg and leave warm-ups out', async () => {
    const routine = routineOf('r-a', 'Lower A', [
      { type: 'warmup', weight_kg: 40, reps: 10 },
      { type: 'normal', weight_kg: 100, reps: 5 },
      { type: 'normal', weight_kg: 100, reps: 5 },
    ]);
    const { client } = harness({ '/v1/routines': () => ({ routine }) });
    const current = await currentRoutines(client, [workout('2026-09-09T10:00:00Z', [], { routine_id: 'r-a' })]);

    expect(formatRoutines(current)).toBe('Lower A [r-a]\n- Squat (Barbell) [SQ]: 5x100kg, 5x100kg');
  });

  it('should be empty when there is nothing to continue', () => {
    expect(formatRoutines([])).toBe('');
  });
});

describe('findSession', () => {
  const block = blockOf([session('Lower A', 'r-1'), session('Upper B', 'r-2')]);

  it('should match the routine id before the title', () => {
    expect(findSession(block, workout(NOW, [], { routine_id: 'r-2', title: 'Lower A' }))?.name).toBe('Upper B');
  });

  it('should match the exact title when the workout carries no routine id', () => {
    expect(findSession(block, workout(NOW, [], { routine_id: null, title: 'Upper B' }))?.name).toBe('Upper B');
  });

  it('should fall back to the title when no session carries the routine id', () => {
    expect(findSession(block, workout(NOW, [], { routine_id: 'r-9', title: 'Upper B' }))?.name).toBe('Upper B');
  });

  it('should return null when neither the id nor the title matches', () => {
    expect(findSession(block, workout(NOW, [], { routine_id: 'r-9', title: 'Bench day' }))).toBeNull();
  });

  it('should return null when there is no block', () => {
    expect(findSession(null, workout(NOW, [], { title: 'Lower A' }))).toBeNull();
  });
});

describe('formatWorkout', () => {
  it('should write the date, the title and every set with its rpe', () => {
    const done = workout('2026-09-07T16:32:48+00:00', [squat([set(85, 7, { rpe: 8.5 }), set(85, 6)])], { title: '2 Lower A' });

    expect(formatWorkout(done)).toBe('2026-09-07 2 Lower A\nSquat (Barbell): 85kg x 7 @8.5, 85kg x 6');
  });
});

describe('writeRoutines, when the write response carries no id', () => {
  it('should take the routine id from the folder, by title', async () => {
    const { client } = harness({
      '/v1/routine_folders': () => listed('routine_folders', [folder(FOLDER_ID)]),
      '/v1/routines': (call) => (call.method === 'POST' ? { routine: {} } : listed('routines', [{ id: 'r-found', title: 'Lower A', folder_id: FOLDER_ID }])),
    });

    const block = await writeRoutines(client, blockOf([session('Lower A', null)]));

    expect(block.sessions[0].hevyRoutineId).toBe('r-found');
  });
});

describe('writeRoutines, when a tracked routine is gone from Hevy', () => {
  it('should write it anew instead of failing the block', async () => {
    const { client, calls } = harness({
      '/v1/routine_folders': () => listed('routine_folders', [folder(FOLDER_ID)]),
      '/v1/routines': (call) => (call.method === 'PUT' ? new Response('gone', { status: NOT_FOUND }) : { routine: { id: 'r-new' } }),
    });

    const block = await writeRoutines(client, blockOf([session('Lower A', 'r-gone')]));

    expect([writes(calls).map((call) => `${call.method} ${call.path}`), block.sessions[0].hevyRoutineId]).toEqual([
      ['PUT /v1/routines/r-gone', 'POST /v1/routines'],
      'r-new',
    ]);
  });
});
