import { createHevyClient, type HevyClient } from '@furkantanyol/hevy-client';

import { getApiKey } from '@/features/settings/api-key';

/**
 * Long enough that the queries one screen fires share a response, short enough that a set logged
 * mid-session shows up on the next pull. Any write through the client clears it.
 */
const CACHE_TTL_MS = 60 * 1000;

let memoized: { readonly apiKey: string; readonly client: HevyClient } | null = null;

/**
 * One client per API key, so every hook shares its in-memory GET cache. A changed key builds a new
 * client, which also drops the previous key's cached responses rather than serving them to whoever
 * holds the new one.
 */
export async function hevyClient(): Promise<HevyClient> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Save your Hevy API key in Settings first.');
  }

  if (memoized?.apiKey !== apiKey) {
    memoized = { apiKey, client: createHevyClient({ apiKey, cacheTtlMs: CACHE_TTL_MS }) };
  }

  return memoized.client;
}
