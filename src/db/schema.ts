import type { RoutineExercise, UpdateRoutineInput } from '@furkantanyol/hevy-client';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  type BaseSQLiteDatabase,
} from 'drizzle-orm/sqlite-core';

export const workouts = sqliteTable(
  'workouts',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    description: text(),
    routineId: text(),
    startTime: integer({ mode: 'timestamp_ms' }).notNull(),
    endTime: integer({ mode: 'timestamp_ms' }).notNull(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('workouts_start_time_idx').on(table.startTime)]
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    /** `${workoutId}:${index}` — Hevy has no id for an exercise inside a workout. */
    id: text().primaryKey(),
    workoutId: text()
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    index: integer().notNull(),
    title: text().notNull(),
    exerciseTemplateId: text().notNull(),
    supersetId: integer(),
    notes: text(),
  },
  (table) => [
    index('workout_exercises_workout_id_idx').on(table.workoutId),
    index('workout_exercises_exercise_template_id_idx').on(table.exerciseTemplateId),
  ]
);

export const sets = sqliteTable(
  'sets',
  {
    /** `${workoutExerciseId}:${index}`. */
    id: text().primaryKey(),
    workoutExerciseId: text()
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    index: integer().notNull(),
    type: text().notNull(),
    weightKg: real(),
    reps: integer(),
    distanceMeters: integer(),
    durationSeconds: integer(),
    rpe: real(),
    customMetric: real(),
  },
  (table) => [index('sets_workout_exercise_id_idx').on(table.workoutExerciseId)]
);

export const exerciseTemplates = sqliteTable('exercise_templates', {
  id: text().primaryKey(),
  title: text().notNull(),
  type: text().notNull(),
  primaryMuscleGroup: text().notNull(),
  secondaryMuscleGroups: text({ mode: 'json' }).$type<string[]>().notNull(),
  equipment: text().notNull(),
  isCustom: integer({ mode: 'boolean' }).notNull(),
});

/** Hevy's routine payload has no `notes`, so there is no column for one — see ADR 0002. */
export const routines = sqliteTable('routines', {
  id: text().primaryKey(),
  title: text().notNull(),
  folderId: integer(),
  /** Routine children stay JSON: nothing queries inside them and updates PUT the whole routine. */
  exercises: text({ mode: 'json' }).$type<RoutineExercise[]>().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull(),
});

/** Local writes waiting to reach Hevy. Routine updates are the only write the app makes today. */
export const outbox = sqliteTable('outbox', {
  /** `autoIncrement` is load-bearing: a plain rowid is reused after a delete, and coalescing
   *  deletes then re-inserts, which would put the re-edited row back at the head of the queue. */
  id: integer().primaryKey({ autoIncrement: true }),
  entityType: text().$type<'routine'>().notNull(),
  entityId: text().notNull(),
  operation: text().$type<'update'>().notNull(),
  payload: text({ mode: 'json' }).$type<UpdateRoutineInput>().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull(),
  attempts: integer().notNull().default(0),
  nextAttemptAt: integer({ mode: 'timestamp_ms' }).notNull(),
  lastError: text(),
});

export const SYNC_STATE_ID = 'default';

/** One row, keyed `default`. */
export const syncState = sqliteTable('sync_state', {
  id: text().primaryKey().default(SYNC_STATE_ID),
  /** Watermark for `workouts.changes()`. Taken before the backfill's first page. */
  workoutsCursor: text(),
  backfillPage: integer().notNull().default(1),
  backfillDone: integer({ mode: 'boolean' }).notNull().default(false),
  templatesSyncedAt: integer({ mode: 'timestamp_ms' }),
  routinesSyncedAt: integer({ mode: 'timestamp_ms' }),
  lastSyncAt: integer({ mode: 'timestamp_ms' }),
  lastError: text(),
});

export const schema = {
  workouts,
  workoutExercises,
  sets,
  exerciseTemplates,
  routines,
  outbox,
  syncState,
};

/** The one database type both drivers satisfy: expo-sqlite in the app, better-sqlite3 in tests. */
export type SyncDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

export type WorkoutRow = typeof workouts.$inferInsert;
export type WorkoutExerciseRow = typeof workoutExercises.$inferInsert;
export type SetRow = typeof sets.$inferInsert;
export type ExerciseTemplateRow = typeof exerciseTemplates.$inferInsert;
export type RoutineRow = typeof routines.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;
