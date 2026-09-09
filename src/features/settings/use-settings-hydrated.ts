import { useEffect, useState } from 'react';

import { useSettingsStore } from './settings-store';

/**
 * Routing reads persisted settings, and the store starts at its defaults until the async read
 * finishes. Without this, a returning user gets one frame of the first-run flow.
 */
export function useSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated());

  useEffect(() => useSettingsStore.persist.onFinishHydration(() => setHydrated(true)), []);

  return hydrated;
}
