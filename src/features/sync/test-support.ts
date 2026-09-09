import type { Routine, Workout } from '@furkantanyol/hevy-client';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { schema, type SyncDatabase } from '@/db/schema';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'drizzle');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

/**
 * An in-memory database built by running the generated migrations, so every test also proves the
 * migrations still apply cleanly.
 */
export function createTestDatabase(): SyncDatabase {
  const sqlite = new Database(':memory:');

  // The app sets this at open time; without it the `on delete cascade` clauses never fire.
  sqlite.pragma('foreign_keys = ON');

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const statements = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').split(STATEMENT_BREAKPOINT);

    for (const statement of statements) {
      if (statement.trim().length > 0) {
        sqlite.exec(statement);
      }
    }
  }

  return drizzle(sqlite, { schema });
}

export function buildWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'workout-1',
    title: 'Push A',
    routine_id: 'routine-1',
    description: 'Felt strong',
    start_time: '2026-09-08T07:00:00Z',
    end_time: '2026-09-08T08:05:00Z',
    created_at: '2026-09-08T08:06:00Z',
    updated_at: '2026-09-08T08:06:00Z',
    exercises: [
      {
        index: 0,
        title: 'Bench Press (Barbell)',
        notes: 'Paused reps',
        exercise_template_id: '05293BCA',
        superset_id: null,
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: 100,
            reps: 5,
            distance_meters: null,
            duration_seconds: null,
            rpe: 8,
            custom_metric: null,
          },
          {
            index: 1,
            type: 'normal',
            weight_kg: 100,
            reps: 5,
            distance_meters: null,
            duration_seconds: null,
            rpe: 9,
            custom_metric: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function buildRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    title: 'Upper Body',
    folder_id: 42,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    exercises: [
      {
        index: 0,
        title: 'Bench Press (Barbell)',
        rest_seconds: 90,
        notes: 'Slow eccentric',
        exercise_template_id: '05293BCA',
        superset_id: null,
        sets: [
          {
            index: 0,
            type: 'normal',
            weight_kg: 100,
            reps: 5,
            distance_meters: null,
            duration_seconds: null,
            rpe: null,
            custom_metric: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}
