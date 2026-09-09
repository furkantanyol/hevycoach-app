import type { RoutineExercise, WorkoutExercise } from '@furkantanyol/hevy-client';

import type { NextSession } from './next-routine';
import type { WeekDayDetail } from './week';

import { formatDate } from '@/features/lifts/format';

/**
 * What the sheet prints under the chart for whichever column the marker is on: the session the
 * lifter logged that day, or — on a today they have not trained yet — the session their routines
 * put next. A day with neither is not judged; it is simply a day with nothing logged on it.
 */
export type DaySession =
  | {
      readonly kind: 'planned';
      readonly title: string;
      readonly note: string;
      readonly exercises: readonly RoutineExercise[];
    }
  | {
      readonly kind: 'logged';
      readonly title: string;
      readonly note: string;
      readonly exercises: readonly WorkoutExercise[];
    }
  | { readonly kind: 'empty'; readonly title: string; readonly note: string };

/** Where the next session came from, so a choice is never shown without its reason. */
export function describeOrigin(next: NextSession): string {
  if (next.after === null) {
    return 'First in your Hevy routines.';
  }
  return `Next in your Hevy routines after ${next.after.title} on ${formatDate(next.after.start_time)}.`;
}

export function daySession(day: WeekDayDetail, next: NextSession | null): DaySession {
  if (day.workouts.length > 0) {
    return {
      kind: 'logged',
      title: day.workouts.map((workout) => workout.title).join(' · '),
      note: `Logged ${formatDate(day.date)}.`,
      exercises: day.workouts.flatMap((workout) => workout.exercises),
    };
  }

  if (day.isToday && next !== null) {
    return { kind: 'planned', title: next.routine.title, note: describeOrigin(next), exercises: next.routine.exercises };
  }

  return {
    kind: 'empty',
    title: formatDate(day.date),
    note: day.isToday ? 'Nothing logged in Hevy today.' : 'Nothing logged in Hevy on this day.',
  };
}
