import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';

import Storage from '@/features/settings/storage';

/** Must be at least the persister's own maxAge, or a restored query is collected on hydration. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    // The device is the source of truth, so a query or a sync still runs while offline instead of
    // being paused by React Query.
    queries: { networkMode: 'offlineFirst', gcTime: ONE_DAY_MS },
    mutations: { networkMode: 'offlineFirst' },
  },
});

export const persister = createAsyncStoragePersister({ storage: Storage });

/**
 * React Query's default online check is a browser one; expo-network is the real signal on a device.
 * Called from an effect rather than at import, because static web rendering runs this file in Node
 * where expo-network's web module has no `window` to listen on.
 */
export function startOnlineWatch(): void {
  onlineManager.setEventListener((setOnline) => {
    // Seed from the current state; the listener only fires on a change.
    getNetworkStateAsync()
      .then((state) => setOnline(state.isConnected ?? false))
      .catch(() => setOnline(true));
    const subscription = addNetworkStateListener((state) => setOnline(state.isConnected ?? false));

    return () => subscription.remove();
  });
}
