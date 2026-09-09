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

import { useScreenAnimation } from '@/hooks/use-screen-animation';
import { persister, queryClient, startOnlineWatch } from '@/lib/query-client';

const navigationIntegration = Sentry.reactNavigationIntegration();
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 1.0,
  integrations: [navigationIntegration],
});

/**
 * The four sections live behind the tab bar. Onboarding and the Pro gate sit outside it: both are
 * whole-app states rather than places, and `(tabs)/_layout` redirects into them.
 */
function RootLayout() {
  const colorScheme = useColorScheme();
  const navigationRef = useNavigationContainerRef();
  const animation = useScreenAnimation();

  useEffect(() => {
    navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(startOnlineWatch, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ animation }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ title: 'Your training' }} />
          <Stack.Screen name="pro" options={{ title: 'Hevy Pro' }} />
        </Stack>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
