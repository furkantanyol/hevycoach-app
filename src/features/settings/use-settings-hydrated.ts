import { useEffect, useState } from 'react';

import { useSettingsStore } from './settings-store';

/**
 * A read that throws, or a value too corrupt to parse, rejects inside the persist middleware and
 * `onFinishHydration` is then never called. Without a deadline the gate in front of the tabs would
 * wait on that forever, showing nothing, with no way out but reinstalling.
 */
const HYDRATION_DEADLINE_MS = 2000;

/**
 * Routing reads persisted settings, and the store starts at its defaults until the async read
 * finishes. Without this, a returning user gets one frame of the first-run flow.
 */
export function useSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated());

  useEffect(() => {
    const unsubscribe = useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
    const deadline = setTimeout(() => setHydrated(true), HYDRATION_DEADLINE_MS);

    return () => {
      unsubscribe();
      clearTimeout(deadline);
    };
  }, []);

  return hydrated;
}
