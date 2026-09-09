import * as Sentry from '@sentry/react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useNavigationContainerRef,
} from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { persister, queryClient, startOnlineWatch } from '@/lib/query-client';

const navigationIntegration = Sentry.reactNavigationIntegration();
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 1.0,
  integrations: [navigationIntegration],
});

function RootLayout() {
  const colorScheme = useColorScheme();
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(startOnlineWatch, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'HevyCoach' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
