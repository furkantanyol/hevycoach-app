import { createHevyClient } from '@furkantanyol/hevy-client';
import { useMutation } from '@tanstack/react-query';
import { count } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { MAX_ATTEMPTS } from './backoff';
import { runSync } from './sync-service';

import { useDatabase } from '@/db/provider';
import { outbox, routines, sets, syncState, workouts, type SyncDatabase } from '@/db/schema';
import { getApiKey } from '@/features/settings/api-key';

type Totals = {
  workouts: number;
  sets: number;
  routines: number;
};

function readTotals(db: SyncDatabase): Totals {
  return {
    workouts: db.select({ value: count() }).from(workouts).get()?.value ?? 0,
    sets: db.select({ value: count() }).from(sets).get()?.value ?? 0,
    routines: db.select({ value: count() }).from(routines).get()?.value ?? 0,
  };
}

/**
 * Live counts, but not row-by-row live. SQLite's change hook fires once per changed row, so
 * counting off `workouts` and `sets` directly would re-run three queries a few hundred times per
 * backfill page. `sync_state` moves once per page and once per sync, which is the pace a human
 * reads at, so the totals are recounted from that.
 *
 * This is only correct because every writer commits its rows before it touches `sync_state`, so
 * the counts a recount reads are never behind the state that triggered it.
 */
function useSyncCounts() {
  const db = useDatabase();
  const state = useLiveQuery(db.select().from(syncState));
  const queue = useLiveQuery(db.select().from(outbox));

  const stateUpdatedAt = state.updatedAt?.getTime();
  // `stateUpdatedAt` is a cache key rather than an input: sync_state moving is the signal to
  // recount, and the counts themselves come from tables the memo does not close over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const totals = useMemo(() => readTotals(db), [db, stateUpdatedAt]);

  return {
    ...totals,
    pendingWrites: queue.data.filter((row) => row.attempts < MAX_ATTEMPTS).length,
    retryingWrites: queue.data.filter(
      (row) => row.attempts > 0 && row.attempts < MAX_ATTEMPTS
    ).length,
    deadWrites: queue.data.filter((row) => row.attempts >= MAX_ATTEMPTS).length,
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
