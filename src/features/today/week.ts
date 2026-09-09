import type { Workout } from '@furkantanyol/hevy-client';

import { countWorkingSets } from '@/features/lifts/sets';

/** Seven columns ending today, because today is the column the sheet is read from. */
export const WEEK_LENGTH = 7;

export type WeekDayDetail = {
  /** The local calendar day, `2026-09-10`. It is the column's identity and never displayed. */
  readonly key: string;
  /** The one-letter column head a printed sheet uses, in the device's own locale. */
  readonly label: string;
  /**
   * Working sets on that day: the ones the lifter logged, or — on a today they have not trained
   * yet — the number of sets the routine itself stores. Both are Hevy's own count of sets, which
   * is what the band ranks. It is not a measure of how hard the session should be.
   */
  readonly volume: number;
  readonly date: Date;
  readonly workouts: readonly Workout[];
  readonly isToday: boolean;
};

/** Local, not UTC: a session logged at 9pm belongs to the day the lifter trained it. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDayBefore(now: Date, daysBack: number): Date {
  const date = new Date(now);
  date.setDate(date.getDate() - daysBack);
  date.setHours(0, 0, 0, 0);
  return date;
}

function groupByDay(workouts: readonly Workout[]): Map<string, Workout[]> {
  const byDay = new Map<string, Workout[]>();

  for (const workout of workouts) {
    const key = localDayKey(new Date(workout.start_time));
    const day = byDay.get(key);
    if (day) {
      day.push(workout);
    } else {
      byDay.set(key, [workout]);
    }
  }

  return byDay;
}

/**
 * The week as the chart draws it: seven days ending today, oldest column first. Every column is
 * the lifter's own logged training; the only exception is a today they have not trained yet, which
 * carries the set count the planned routine already stores in Hevy.
 */
export function buildWeek(
  workouts: readonly Workout[],
  plannedSets: number,
  now: Date = new Date()
): WeekDayDetail[] {
  const byDay = groupByDay(workouts);

  return Array.from({ length: WEEK_LENGTH }, (_, column) => {
    const date = startOfDayBefore(now, WEEK_LENGTH - 1 - column);
    const key = localDayKey(date);
    const logged = byDay.get(key) ?? [];
    const isToday = column === WEEK_LENGTH - 1;
    const trained = countWorkingSets(logged.flatMap((workout) => workout.exercises));

    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
      volume: isToday && trained === 0 ? plannedSets : trained,
      date,
      workouts: logged,
      isToday,
    };
  });
}

/** The span the chart covers, for the stamp above it. */
export function describeWeek(days: readonly WeekDayDetail[]): string {
  const first = days.at(0);
  const last = days.at(-1);
  if (first === undefined || last === undefined) {
    return '';
  }
  const format = { day: 'numeric', month: 'short' } as const;
  return `${first.date.toLocaleDateString(undefined, format)} – ${last.date.toLocaleDateString(undefined, format)}`;
}
