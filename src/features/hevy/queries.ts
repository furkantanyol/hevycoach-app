import {
  fetchAll,
  MAX_PAGE_SIZE,
  type ExerciseHistoryEntry,
  type HevyClient,
  type Routine,
  type Workout,
} from '@furkantanyol/hevy-client';
import { useQuery } from '@tanstack/react-query';

import { hevyClient } from './client';

import { queryClient } from '@/lib/query-client';

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * MILLISECONDS_PER_MINUTE;

/** History only moves when the user finishes a session, so minutes are fresh enough. */
const WORKOUTS_STALE_TIME_MS = 5 * MILLISECONDS_PER_MINUTE;

/** The exercise library only moves when the user writes a custom exercise. */
const TEMPLATES_STALE_TIME_MS = MILLISECONDS_PER_DAY;

/** Every Hevy query hangs off this prefix, so one call can drop the whole account's cache. */
const HEVY_SCOPE = ['hevy'] as const;

export const hevyQueryKeys = {
  recentWorkouts: (days: number) => [...HEVY_SCOPE, 'workouts', 'recent', days] as const,
  routines: () => [...HEVY_SCOPE, 'routines'] as const,
  exerciseHistory: (exerciseTemplateId: string) =>
    [...HEVY_SCOPE, 'exercise-history', exerciseTemplateId] as const,
  exerciseTemplates: () => [...HEVY_SCOPE, 'exercise-templates'] as const,
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

async function fetchRoutines(client: HevyClient): Promise<Routine[]> {
  return fetchAll(async (page) => {
    const listed = await client.routines.list({ page, pageSize: MAX_PAGE_SIZE });
    return { page: listed.page, page_count: listed.page_count, items: listed.routines };
  });
}

/** The routines the user already has in Hevy, with the targets Hevy itself stores. */
export function useRoutines({ enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.routines(),
    queryFn: async () => fetchRoutines(await hevyClient()),
    staleTime: WORKOUTS_STALE_TIME_MS,
    enabled,
  });
}

/**
 * The whole exercise library, which is what maps a logged exercise to its muscle group. It is one
 * hundred templates a page, so `listAll` is a handful of requests and then a day of cache.
 */
export function useExerciseTemplates({ enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.exerciseTemplates(),
    queryFn: async () => (await hevyClient()).exerciseTemplates.listAll(),
    staleTime: TEMPLATES_STALE_TIME_MS,
    enabled,
  });
}

/** One entry per logged set for a single exercise, newest workout first. */
export function useExerciseHistory(exerciseTemplateId: string, { enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.exerciseHistory(exerciseTemplateId),
    queryFn: async (): Promise<ExerciseHistoryEntry[]> =>
      (await hevyClient()).exerciseHistory.get(exerciseTemplateId),
    staleTime: WORKOUTS_STALE_TIME_MS,
    enabled,
  });
}
