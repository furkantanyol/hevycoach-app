import { createHevyClient, type Workout } from 'hevy-sdk';
import { describe, expect, it } from 'vitest';
import { recentWorkouts } from './hevy.js';

const OK = 200;
const A_PAGE = 10;
const RECENT_LIMIT = 30;

const workout = (startTime: string): Workout => ({ id: `w-${startTime}`, title: 'Lower A', routine_id: null, description: '', start_time: startTime, end_time: startTime, updated_at: startTime, created_at: startTime, exercises: [] });

/** Serves one page of workouts per requested page number and records the pages that were asked for. */
function harness(pages: Record<string, Workout[]>, pageCount: number) {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const page = new URL(String(input)).searchParams.get('page') ?? '';
    requested.push(page);
    const body = { page: Number(page), page_count: pageCount, workouts: pages[page] ?? [] };
    return new Response(JSON.stringify(body), { status: OK });
  };
  return { requested, client: createHevyClient({ apiKey: 'test', fetch: fetchImpl, retries: 0 }) };
}

describe('recentWorkouts', () => {
  it('should stop paging as soon as it holds the limit', async () => {
    const page = Array.from({ length: A_PAGE }, (_, index) => workout(`2026-09-0${index % 9}T10:00:00Z`));
    const { client, requested } = harness({ '1': page, '2': page, '3': page }, 3);

    await recentWorkouts(client, A_PAGE);

    expect(requested).toEqual(['1']);
  });

  it('should return the newest workouts first', async () => {
    const pages = { '1': [workout('2026-09-01T10:00:00Z'), workout('2026-09-05T10:00:00Z')] };
    const { client } = harness(pages, 1);

    const recent = await recentWorkouts(client, 2);

    expect(recent.map((entry) => entry.start_time)).toEqual(['2026-09-05T10:00:00Z', '2026-09-01T10:00:00Z']);
  });

  it('should return everything logged when the account holds fewer than the limit', async () => {
    const { client } = harness({ '1': [workout('2026-09-01T10:00:00Z')] }, 1);

    await expect(recentWorkouts(client, RECENT_LIMIT)).resolves.toHaveLength(1);
  });

  it('should return nothing for an account with no workouts', async () => {
    const { client } = harness({}, 1);

    await expect(recentWorkouts(client, RECENT_LIMIT)).resolves.toEqual([]);
  });
});
