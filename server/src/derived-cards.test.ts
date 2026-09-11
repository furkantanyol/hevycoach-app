import type { Workout, WorkoutExercise, WorkoutSet } from 'hevy-sdk';
import { describe, expect, it } from 'vitest';
import { cardsView, type DayLabel, type DayVolume } from './derived.js';
import type { Block, Exercise, Session } from './state.js';

/** Thursday 10 September 2026, local. The most recent Monday 00:00 is then the 7th. */
const NOW = new Date(2026, 8, 10, 12, 0, 0);
const MONDAY = new Date(2026, 8, 7, 0, 0, 0);
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const DAYS: readonly DayLabel[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const weekWith = (lifted: DayLabel, kg: number): DayVolume[] => DAYS.map((day) => ({ day, kg: day === lifted ? kg : 0 }));
const EMPTY_WEEK: DayVolume[] = DAYS.map((day) => ({ day, kg: 0 }));

const iso = (epochMs: number): string => new Date(epochMs).toISOString();
const daysAgo = (days: number): string => iso(NOW.getTime() - days * MS_PER_DAY);

interface SetInput {
  weightKg: number | null;
  reps: number | null;
  warmup?: boolean;
}

const set = (index: number, { weightKg, reps, warmup }: SetInput): WorkoutSet => ({
  index,
  type: warmup ? 'warmup' : 'normal',
  weight_kg: weightKg,
  reps,
  distance_meters: null,
  duration_seconds: null,
  rpe: null,
  custom_metric: null,
});

const performed = (title: string, sets: SetInput[], index = 0): WorkoutExercise => ({
  index,
  title,
  notes: '',
  exercise_template_id: title,
  superset_id: null,
  sets: sets.map((input, position) => set(position, input)),
});

const workout = (start: string, exercises: WorkoutExercise[], routineId: string | null = null): Workout => ({
  id: `w-${start}`,
  title: 'Lower A',
  routine_id: routineId,
  description: '',
  start_time: start,
  end_time: start,
  updated_at: start,
  created_at: start,
  exercises,
});

/** Ten reps at the given weight, so a lift's volume is ten times its weight. */
const tenReps = (title: string, weightKg: number, index: number): WorkoutExercise =>
  performed(title, [{ weightKg, reps: 10 }], index);

const planned = (title: string): Exercise => ({ templateId: title, title, sets: 3, reps: 5, weightKg: 100, rpe: 8, note: '' });

const session = (name: string, hevyRoutineId: string, exercises: Exercise[] = []): Session => ({ name, focus: 'lower', hevyRoutineId, exercises });
const blockOf = (...sessions: Session[]): Block => ({ name: 'Block A', weeks: 4, sessions, createdAt: daysAgo(30), reason: 'intake' });

describe('cardsView week volume', () => {
  it('should report zeros for every day when the history is empty', () => {
    expect(cardsView(null, [], NOW).weekVolume).toEqual({ totalKg: 0, sessions: 0, byDay: EMPTY_WEEK });
  });

  it('should leave warm-up sets out of the volume', () => {
    const bench = performed('Bench Press (Barbell)', [
      { weightKg: 40, reps: 10, warmup: true },
      { weightKg: 100, reps: 5 },
      { weightKg: 100, reps: 5 },
    ]);

    expect(cardsView(null, [workout(daysAgo(1), [bench])], NOW).weekVolume.totalKg).toBe(1000);
  });

  it('should price a set logged without a weight at zero', () => {
    const pullUp = performed('Pull Up', [{ weightKg: null, reps: 8 }]);

    expect(cardsView(null, [workout(daysAgo(1), [pullUp])], NOW).weekVolume.totalKg).toBe(0);
  });

  it('should round the week total to the nearest kilogram', () => {
    const curl = performed('Bicep Curl (Dumbbell)', [{ weightKg: 12.5, reps: 9 }]);

    expect(cardsView(null, [workout(daysAgo(1), [curl])], NOW).weekVolume.totalKg).toBe(113);
  });

  it('should put the volume on the weekday the workout started', () => {
    const wednesday = workout(daysAgo(1), [tenReps('Squat (Barbell)', 100, 0)]);

    expect(cardsView(null, [wednesday], NOW).weekVolume.byDay).toEqual([
      { day: 'Mon', kg: 0 },
      { day: 'Tue', kg: 0 },
      { day: 'Wed', kg: 1000 },
      { day: 'Thu', kg: 0 },
      { day: 'Fri', kg: 0 },
      { day: 'Sat', kg: 0 },
      { day: 'Sun', kg: 0 },
    ]);
  });

  it('should count a workout starting exactly at midnight on the most recent Monday', () => {
    const monday = workout(iso(MONDAY.getTime()), [tenReps('Squat (Barbell)', 100, 0)]);

    expect(cardsView(null, [monday], NOW).weekVolume).toEqual({
      totalKg: 1000,
      sessions: 1,
      byDay: weekWith('Mon', 1000),
    });
  });

  it('should exclude a workout from the minute before that Monday', () => {
    const sunday = workout(iso(MONDAY.getTime() - MS_PER_MINUTE), [tenReps('Squat (Barbell)', 100, 0)]);

    expect(cardsView(null, [sunday], NOW).weekVolume).toEqual({ totalKg: 0, sessions: 0, byDay: EMPTY_WEEK });
  });

  it('should count two workouts on one day as two sessions', () => {
    const twice = [workout(daysAgo(1), []), workout(daysAgo(1), [])];

    expect(cardsView(null, twice, NOW).weekVolume.sessions).toBe(2);
  });
});

describe('cardsView last workout', () => {
  it('should report no last workout when the window is empty', () => {
    expect(cardsView(null, [], NOW).lastWorkout).toBeNull();
  });

  it('should report the newest workout of the window as the last one', () => {
    const view = cardsView(null, [workout(daysAgo(1), []), workout(daysAgo(4), [])], NOW);

    expect(view.lastWorkout).toEqual({ title: 'Lower A', at: daysAgo(1), lifts: [] });
  });

  it('should take the most common reps and the top weight of the working sets', () => {
    const squat = performed('Squat (Barbell)', [
      { weightKg: 60, reps: 10, warmup: true },
      { weightKg: 100, reps: 5 },
      { weightKg: 105, reps: 3 },
      { weightKg: 100, reps: 5 },
    ]);

    expect(cardsView(null, [workout(daysAgo(1), [squat])], NOW).lastWorkout?.lifts).toEqual([
      { title: 'Squat (Barbell)', sets: 3, reps: 5, weightKg: 105, volumeKg: 1315 },
    ]);
  });

  it('should group an exercise logged twice in one session into a single lift', () => {
    const first = performed('Bench Press (Barbell)', [{ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }], 0);
    const again = performed('Bench Press (Barbell)', [{ weightKg: 90, reps: 8 }], 2);

    expect(cardsView(null, [workout(daysAgo(1), [first, again])], NOW).lastWorkout?.lifts).toEqual([
      { title: 'Bench Press (Barbell)', sets: 3, reps: 5, weightKg: 100, volumeKg: 1720 },
    ]);
  });

  it('should leave an exercise with nothing but warm-ups out of the lifts', () => {
    const squat = tenReps('Squat (Barbell)', 100, 0);
    const abandoned = performed('Leg Press (Machine)', [{ weightKg: 80, reps: 10, warmup: true }], 1);

    const view = cardsView(null, [workout(daysAgo(1), [squat, abandoned])], NOW);

    expect(view.lastWorkout?.lifts.map((lift) => lift.title)).toEqual(['Squat (Barbell)']);
  });

  it('should list every lift, heaviest total first', () => {
    const exercises = [
      tenReps('Bicep Curl (Dumbbell)', 10, 0),
      tenReps('Seated Row (Cable)', 40, 1),
      tenReps('Squat (Barbell)', 100, 2),
      tenReps('Bench Press (Barbell)', 60, 3),
      tenReps('Overhead Press (Barbell)', 20, 4),
    ];

    const view = cardsView(null, [workout(daysAgo(1), exercises)], NOW);

    expect(view.lastWorkout?.lifts.map((lift) => lift.title)).toEqual([
      'Squat (Barbell)',
      'Bench Press (Barbell)',
      'Seated Row (Cable)',
      'Overhead Press (Barbell)',
      'Bicep Curl (Dumbbell)',
    ]);
  });
});

describe('cardsView next session', () => {
  const push = session('1 Push', 'r-push');
  const pull = session('2 Pull', 'r-pull');
  const legs = session('3 Legs', 'r-legs');

  it('should report no next session when no block has been written', () => {
    expect(cardsView(null, [workout(daysAgo(1), [], 'r-push')], NOW).nextSession).toBeNull();
  });

  it('should name the session after the last one they ran', () => {
    const view = cardsView(blockOf(push, pull, legs), [workout(daysAgo(1), [], 'r-pull')], NOW);

    expect(view.nextSession).toEqual({ name: '3 Legs', exercises: [] });
  });

  it('should wrap to the first session after the last one in the block', () => {
    const view = cardsView(blockOf(push, pull, legs), [workout(daysAgo(1), [], 'r-legs')], NOW);

    expect(view.nextSession?.name).toBe('1 Push');
  });

  it('should name the first session when nothing in the window matches a routine', () => {
    const view = cardsView(blockOf(push, pull), [workout(daysAgo(1), [])], NOW);

    expect(view.nextSession?.name).toBe('1 Push');
  });

  it('should list every exercise of that session', () => {
    const titles = ['Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise'];
    const heavy = session('1 Lower', 'r-lower', titles.map(planned));

    const view = cardsView(blockOf(heavy), [workout(daysAgo(1), [])], NOW);

    expect(view.nextSession?.exercises).toEqual(titles);
  });
});

describe('nextSession, matched by title', () => {
  it('should step past the session whose name the last workout carries when the block holds other routine ids', () => {
    const block = blockOf(session('1 Push', 'r-old-push'), session('2 Pull', 'r-old-pull'));

    const view = cardsView(block, [{ ...workout(daysAgo(1), []), title: '1 Push' }], NOW);

    expect(view.nextSession?.name).toBe('2 Pull');
  });
});
