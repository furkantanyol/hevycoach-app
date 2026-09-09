import { createHevyClient, type HevyClient } from '@furkantanyol/hevy-client';

import { getApiKey } from '@/features/settings/api-key';

/** The client is a plain object over `fetch`; React Query owns the caching above it. */
export async function hevyClient(): Promise<HevyClient> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Save your Hevy API key in Settings first.');
  }

  return createHevyClient({ apiKey });
}
