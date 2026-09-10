import type { Workout } from '@furkantanyol/hevy-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockView, prefillFrom, progressView } from './derived.js';
import type { ExerciseHistory, HistorySummary } from './hevy.js';
import type { Block, Message, Session } from './state.js';

/** Thursday 10 September 2026, local. The most recent Monday 00:00 is then the 7th. */
const NOW = new Date(2026, 8, 10, 12, 0, 0);
const MONDAY = new Date(2026, 8, 7, 0, 0, 0);
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_YEAR = 31_557_600_000;
const EIGHT_WEEKS_DAYS = 56;
const TOP_LIFTS = 15;

const iso = (epochMs: number): string => new Date(epochMs).toISOString();
const daysAgo = (days: number): string => iso(NOW.getTime() - days * MS_PER_DAY);
const yearsAgo = (years: number): string => iso(NOW.getTime() - years * MS_PER_YEAR);

const workout = (start: string, extra: Partial<Workout> = {}): Workout => ({
  id: `w-${start}`,
  title: 'Lower A',
  routine_id: null,
  description: '',
  start_time: start,
  end_time: start,
  updated_at: start,
  created_at: start,
  exercises: [],
  ...extra,
});

const lasting = (start: string, minutes: number): Workout =>
  workout(start, { end_time: iso(Date.parse(start) + minutes * MS_PER_MINUTE) });

const ran = (routineId: string, start: string): Workout => workout(start, { routine_id: routineId });

const lift = (title: string, sessions = 1): ExerciseHistory => ({
  templateId: title,
  title,
  sessions,
  lastPerformed: daysAgo(1),
  bestWeightKg: 100,
  bestReps: 5,
  e1rmTrend: [],
  weeklyFrequency: 1,
});

const summaryOf = (extra: Partial<HistorySummary> = {}): HistorySummary => ({
  workouts: 0,
  firstWorkout: null,
  lastWorkout: null,
  latestBodyweightKg: null,
  exercises: [],
  ...extra,
});

const session = (name: string, hevyRoutineId: string | null): Session => ({ name, focus: 'lower', hevyRoutineId, exercises: [] });
const blockOf = (...sessions: Session[]): Block => ({ name: 'Block A', weeks: 4, sessions, createdAt: daysAgo(30), reason: 'intake' });
const verdictFor = (name: string, text: string, createdAt: string): Message => ({ id: `m-${text}`, role: 'assistant', text, createdAt, kind: 'verdict', session: name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('prefillFrom', () => {
  it('should report every field as absent when the account has no history', () => {
    expect(prefillFrom(summaryOf(), [])).toEqual({
      bodyweightKg: null,
      daysPerWeek: null,
      sessionMinutes: null,
      yearsTraining: null,
      equipment: null,
      workouts: 0,
      firstWorkout: null,
    });
  });

  it('should take the bodyweight from the latest body measurement', () => {
    const prefill = prefillFrom(summaryOf({ latestBodyweightKg: 78.4 }), []);

    expect(prefill.bodyweightKg).toBe(78.4);
  });

  it('should round sessions over the last eight weeks into days per week', () => {
    const recent = Array.from({ length: 16 }, (_, index) => workout(daysAgo(index * 3)));

    expect(prefillFrom(summaryOf(), recent).daysPerWeek).toBe(2);
  });

  it('should count a workout falling exactly on the eight week edge', () => {
    const recent = Array.from({ length: 8 }, () => workout(daysAgo(EIGHT_WEEKS_DAYS)));

    expect(prefillFrom(summaryOf(), recent).daysPerWeek).toBe(1);
  });

  it('should report no days per week when every workout predates the window', () => {
    const recent = [workout(daysAgo(EIGHT_WEEKS_DAYS + 1))];

    expect(prefillFrom(summaryOf(), recent).daysPerWeek).toBeNull();
  });

  it('should never prefill fewer days per week than the profile accepts', () => {
    const recent = [workout(daysAgo(1))];

    expect(prefillFrom(summaryOf(), recent).daysPerWeek).toBe(1);
  });

  it('should round the median workout duration to a quarter hour', () => {
    const recent = [lasting(daysAgo(1), 70), lasting(daysAgo(3), 74), lasting(daysAgo(5), 80)];

    expect(prefillFrom(summaryOf(), recent).sessionMinutes).toBe(75);
  });

  it('should ignore workouts older than the last twenty when taking the median', () => {
    const recent = Array.from({ length: 20 }, (_, index) => lasting(daysAgo(index + 1), 60));
    const ancient = Array.from({ length: 5 }, (_, index) => lasting(daysAgo(index + 40), 180));

    expect(prefillFrom(summaryOf(), [...recent, ...ancient]).sessionMinutes).toBe(60);
  });

  it('should report no session length when no workout has a positive duration', () => {
    expect(prefillFrom(summaryOf(), [workout(daysAgo(1))]).sessionMinutes).toBeNull();
  });

  it('should bucket a first workout from four years ago as three to five years', () => {
    const prefill = prefillFrom(summaryOf({ firstWorkout: yearsAgo(4) }), []);

    expect(prefill.yearsTraining).toBe('3-5');
  });

  it('should bucket a first workout exactly one year old as one to three years', () => {
    const prefill = prefillFrom(summaryOf({ firstWorkout: yearsAgo(1) }), []);

    expect(prefill.yearsTraining).toBe('1-3');
  });

  it('should bucket a first workout older than five years as five plus', () => {
    const prefill = prefillFrom(summaryOf({ firstWorkout: yearsAgo(9) }), []);

    expect(prefill.yearsTraining).toBe('5+');
  });

  it('should guess a full gym when a barbell, machine or cable lift was used', () => {
    const summary = summaryOf({ exercises: [lift('Lateral Raise (Dumbbell)'), lift('Lat Pulldown (Cable)')] });

    expect(prefillFrom(summary, []).equipment).toBe('full_gym');
  });

  it('should guess dumbbells when only dumbbell lifts were used', () => {
    const summary = summaryOf({ exercises: [lift('Bench Press (Dumbbell)')] });

    expect(prefillFrom(summary, []).equipment).toBe('dumbbells');
  });

  it('should guess bodyweight when no lift names any equipment', () => {
    const summary = summaryOf({ exercises: [lift('Pull Up'), lift('Push Up')] });

    expect(prefillFrom(summary, []).equipment).toBe('bodyweight');
  });
});

describe('blockView', () => {
  const push = session('1 Push', 'r-push');
  const pull = session('2 Pull', 'r-pull');
  const legs = session('3 Legs', 'r-legs');

  it('should report no block when none has been written', () => {
    expect(blockView(null, [ran('r-push', daysAgo(1))], [])).toEqual({
      block: null,
      nextSessionIndex: null,
      completions: {},
    });
  });

  it('should key a completion by the index of the session the routine id matches', () => {
    const view = blockView(blockOf(push, pull, legs), [ran('r-pull', daysAgo(2))], []);

    expect(view.completions).toEqual({ 1: { completedAt: daysAgo(2), verdict: null } });
  });

  it('should attach the verdict written for that session name', () => {
    const messages = [verdictFor('2 Pull', 'Strong rows.', daysAgo(2))];

    const view = blockView(blockOf(push, pull), [ran('r-pull', daysAgo(2))], messages);

    expect(view.completions[1].verdict).toBe('Strong rows.');
  });

  it('should keep the newest verdict when a session has several', () => {
    const messages = [
      verdictFor('1 Push', 'Old take.', daysAgo(9)),
      verdictFor('1 Push', 'Fresh take.', daysAgo(1)),
    ];

    const view = blockView(blockOf(push), [ran('r-push', daysAgo(1))], messages);

    expect(view.completions[0].verdict).toBe('Fresh take.');
  });

  it('should keep the newest workout when a session was run twice', () => {
    const workouts = [ran('r-push', daysAgo(8)), ran('r-push', daysAgo(1))];

    const view = blockView(blockOf(push), workouts, []);

    expect(view.completions[0].completedAt).toBe(daysAgo(1));
  });

  it('should point at the session following the most recently completed one', () => {
    const workouts = [ran('r-push', daysAgo(4)), ran('r-pull', daysAgo(1))];

    const view = blockView(blockOf(push, pull, legs), workouts, []);

    expect(view.nextSessionIndex).toBe(2);
  });

  it('should wrap to the first session after the last one in the block', () => {
    const view = blockView(blockOf(push, pull, legs), [ran('r-legs', daysAgo(1))], []);

    expect(view.nextSessionIndex).toBe(0);
  });

  it('should point at the first session when nothing has been completed', () => {
    const view = blockView(blockOf(push, pull), [], []);

    expect(view.nextSessionIndex).toBe(0);
  });

  it('should not match a free workout against a session that has no routine yet', () => {
    const view = blockView(blockOf(session('1 Push', null)), [workout(daysAgo(1))], []);

    expect(view.completions).toEqual({});
  });
});

describe('progressView', () => {
  it('should pass the workout counts and span through from the summary', () => {
    const summary = summaryOf({ workouts: 214, firstWorkout: yearsAgo(4), lastWorkout: daysAgo(1) });

    const view = progressView(summary, []);

    expect(view).toMatchObject({ workouts: 214, firstWorkout: yearsAgo(4), lastWorkout: daysAgo(1) });
  });

  it('should count a workout starting exactly at midnight on the most recent Monday', () => {
    const view = progressView(summaryOf(), [workout(iso(MONDAY.getTime()))]);

    expect(view.thisWeek).toBe(1);
  });

  it('should exclude a workout from the minute before that Monday', () => {
    const view = progressView(summaryOf(), [workout(iso(MONDAY.getTime() - MS_PER_MINUTE))]);

    expect(view.thisWeek).toBe(0);
  });

  it('should return the fifteen most trained lifts', () => {
    const exercises = Array.from({ length: 20 }, (_, index) => lift(`Lift ${index}`, index));

    const view = progressView(summaryOf({ exercises }), []);

    expect([view.lifts.length, view.lifts[0].sessions]).toEqual([TOP_LIFTS, 19]);
  });
});
