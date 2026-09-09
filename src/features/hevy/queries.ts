import { MAX_PAGE_SIZE, type HevyClient, type Workout } from '@furkantanyol/hevy-client';
import { useQuery } from '@tanstack/react-query';

import { hevyClient } from './client';

import { queryClient } from '@/lib/query-client';

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * MILLISECONDS_PER_MINUTE;

/** History only moves when the user finishes a session, so minutes are fresh enough. */
const WORKOUTS_STALE_TIME_MS = 5 * MILLISECONDS_PER_MINUTE;

/** Every Hevy query hangs off this prefix, so one call can drop the whole account's cache. */
const HEVY_SCOPE = ['hevy'] as const;

export const hevyQueryKeys = {
  recentWorkouts: (days: number) => [...HEVY_SCOPE, 'workouts', 'recent', days] as const,
};

/**
 * A new API key may be a different Hevy account, and the query cache is not keyed by account — it
 * is also persisted, so without this a restart would serve the previous key's history. Resetting
 * rather than removing clears mounted observers too, and refetches the ones still on screen.
 */
export function resetHevyQueries(): void {
  void queryClient.resetQueries({ queryKey: HEVY_SCOPE });
}

type QueryOptions = { readonly enabled?: boolean };

/**
 * Workouts newest first, back to `days` ago — and never fewer than one page, so the most recent
 * session is always in hand even when the window is empty.
 */
async function fetchRecentWorkouts(client: HevyClient, days: number): Promise<Workout[]> {
  const since = Date.now() - days * MILLISECONDS_PER_DAY;
  const collected: Workout[] = [];

  for (let page = 1; ; page += 1) {
    const listed = await client.workouts.list({ page, pageSize: MAX_PAGE_SIZE });
    collected.push(...listed.workouts);

    const oldestOnPage = listed.workouts.at(-1);
    const reachedWindowEdge =
      oldestOnPage === undefined || Date.parse(oldestOnPage.start_time) < since;

    if (reachedWindowEdge || page >= listed.page_count) {
      return collected;
    }
  }
}

export function useRecentWorkouts(days: number, { enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.recentWorkouts(days),
    queryFn: async () => fetchRecentWorkouts(await hevyClient(), days),
    staleTime: WORKOUTS_STALE_TIME_MS,
    enabled,
  });
}
