import { createHevyClient } from '@furkantanyol/hevy-client';
import { useMutation } from '@tanstack/react-query';
import { count } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { MAX_ATTEMPTS } from './backoff';
import { runSync } from './sync-service';

import { useDatabase } from '@/db/provider';
import { outbox, routines, sets, syncState, workouts } from '@/db/schema';
import { getApiKey } from '@/features/settings/api-key';

/** Counts read straight from SQLite, refreshed by drizzle whenever a sync writes rows. */
function useSyncCounts() {
  const db = useDatabase();

  const workoutRows = useLiveQuery(db.select({ value: count() }).from(workouts));
  const setRows = useLiveQuery(db.select({ value: count() }).from(sets));
  const routineRows = useLiveQuery(db.select({ value: count() }).from(routines));
  const queue = useLiveQuery(db.select().from(outbox));
  const state = useLiveQuery(db.select().from(syncState));

  return {
    workouts: workoutRows.data[0]?.value ?? 0,
    sets: setRows.data[0]?.value ?? 0,
    routines: routineRows.data[0]?.value ?? 0,
    pendingWrites: queue.data.filter((row) => row.attempts < MAX_ATTEMPTS).length,
    failedWrites: queue.data.filter((row) => row.attempts > 0).length,
    lastWriteError: queue.data.find((row) => row.lastError !== null)?.lastError ?? null,
    state: state.data[0] ?? null,
  };
}

export function useSync() {
  const db = useDatabase();
  const counts = useSyncCounts();

  const { mutate, status, data, error } = useMutation({
    mutationFn: async () => {
      const apiKey = await getApiKey();

      if (!apiKey) {
        throw new Error('Save your Hevy API key in Settings first.');
      }

      return runSync(db, createHevyClient({ apiKey }));
    },
  });

  return {
    run: mutate,
    status,
    summary: data ?? null,
    error: error?.message ?? null,
    counts,
  };
}
