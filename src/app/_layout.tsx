/*
THESIS: The programme is the interface, weeks as columns and load as banded rows. It refuses the fitness dashboard of rings, cards and streaks.
OWN-WORLD: Paper-white ground, hairline rules, near-black ink. Load is a greyscale band ramp that survives gym glare and greyscale reproduction. One fluorescent marker highlight, reserved for today and used nowhere else. System faces, tabular figures, no brand face.
STORY: The lifter sees the week as a chart, finds today highlighted, reads the bar to load, and lifts.
FIRST VIEWPORT: Block and week stamped small. Then seven ruled day-columns, each session a band darkened by its load, today's column carrying a full-height highlight. Below the rule, today's session as a ruled table, exercise and target and last time, figures aligned in columns. The first target is the largest thing on screen.
FORM: The Block Chart, candidate 1 of my ordered list, seed key c2b20aa3.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
*/

import * as Sentry from '@sentry/react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, ThemeProvider, useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useScreenAnimation } from '@/components/motion';
import { Screen } from '@/constants/theme';
import { useNavigationTheme } from '@/hooks/use-theme';
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
  const navigationRef = useNavigationContainerRef();
  const animation = useScreenAnimation();
  const theme = useNavigationTheme();

  useEffect(() => {
    navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(startOnlineWatch, []);

  return (
    <GestureHandlerRootView style={Screen.container}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <ThemeProvider value={theme}>
          <Stack screenOptions={{ animation }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ title: 'Your training' }} />
            <Stack.Screen name="pro" options={{ title: 'Hevy Pro' }} />
          </Stack>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
