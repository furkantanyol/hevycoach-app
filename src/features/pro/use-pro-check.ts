import { useMutation } from '@tanstack/react-query';

import { fetchProStatus, type ProStatus } from './pro-status';

import { hevyClient } from '@/features/hevy/client';
import { useSettingsStore } from '@/features/settings/settings-store';

type ProCheck = {
  readonly status: ProStatus;
  readonly check: () => void;
  readonly checking: boolean;
};

/**
 * Runs the one entitlement check the product has, and persists what it decided. Saving a key
 * calls it; so does the retry on the Pro screen, which is the only way out of `unknown`.
 */
export function useProCheck(): ProCheck {
  const status = useSettingsStore((state) => state.proStatus);
  const setProStatus = useSettingsStore((state) => state.setProStatus);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => fetchProStatus(await hevyClient()),
    onSuccess: setProStatus,
    // No key saved yet, or a client that could not be built, is not an entitlement answer either.
    onError: () => setProStatus('unknown'),
  });

  return { status, check: mutate, checking: isPending };
}
