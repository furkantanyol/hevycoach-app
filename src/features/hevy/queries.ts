import { MAX_PAGE_SIZE, type HevyClient, type Workout } from '@furkantanyol/hevy-client';
import { useQuery } from '@tanstack/react-query';

import { hevyClient } from './client';

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * MILLISECONDS_PER_MINUTE;

/** History only moves when the user finishes a session, so minutes are fresh enough. */
const WORKOUTS_STALE_TIME_MS = 5 * MILLISECONDS_PER_MINUTE;
/** Routines change when this app or the user rewrites one — rare, but not never. */
const ROUTINES_STALE_TIME_MS = 15 * MILLISECONDS_PER_MINUTE;
/** Hevy's exercise library plus the user's own customs. It effectively does not change. */
const TEMPLATES_STALE_TIME_MS = MILLISECONDS_PER_DAY;

export const hevyQueryKeys = {
  recentWorkouts: (days: number) => ['hevy', 'workouts', 'recent', days] as const,
  exerciseHistory: (exerciseTemplateId: string) =>
    ['hevy', 'exercise-history', exerciseTemplateId] as const,
  routines: ['hevy', 'routines'] as const,
  exerciseTemplates: ['hevy', 'exercise-templates'] as const,
};

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

/** `GET /exercise_history/{id}` is unpaginated: one request is the lift's entire history. */
export function useExerciseHistory(exerciseTemplateId: string, { enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.exerciseHistory(exerciseTemplateId),
    queryFn: async () => (await hevyClient()).exerciseHistory.get(exerciseTemplateId),
    staleTime: WORKOUTS_STALE_TIME_MS,
    enabled,
  });
}

export function useRoutines({ enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.routines,
    queryFn: async () => (await hevyClient()).routines.listAll(),
    staleTime: ROUTINES_STALE_TIME_MS,
    enabled,
  });
}

export function useExerciseTemplates({ enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: hevyQueryKeys.exerciseTemplates,
    queryFn: async () => (await hevyClient()).exerciseTemplates.listAll(),
    staleTime: TEMPLATES_STALE_TIME_MS,
    enabled,
  });
}
