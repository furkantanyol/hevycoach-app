import { and, count, desc, eq, gte, ne } from 'drizzle-orm';

import { sets, workoutExercises, workouts, type SyncDatabase } from '@/db/schema';

const CONTEXT_WINDOW_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A one-line summary of recent training, built from local SQLite — never a hardcoded string. This
 * is the round trip Gate B2 checks: local data goes up, coaching comes back.
 */
export function buildWeeklyContext(db: SyncDatabase, now: Date = new Date()): string {
  const since = new Date(now.getTime() - CONTEXT_WINDOW_DAYS * MILLISECONDS_PER_DAY);

  const sessions =
    db.select({ value: count() }).from(workouts).where(gte(workouts.startTime, since)).get()
      ?.value ?? 0;

  const workingSets =
    db
      .select({ value: count() })
      .from(sets)
      .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(gte(workouts.startTime, since), ne(sets.type, 'warmup')))
      .get()?.value ?? 0;

  const latest = db
    .select({ title: workouts.title, startTime: workouts.startTime })
    .from(workouts)
    .orderBy(desc(workouts.startTime))
    .limit(1)
    .get();

  const latestSummary = latest
    ? `most recent workout "${latest.title}" on ${latest.startTime.toISOString()}`
    : 'no workouts logged yet';

  return `${sessions} sessions and ${workingSets} working sets in the last ${CONTEXT_WINDOW_DAYS} days; ${latestSummary}.`;
}
