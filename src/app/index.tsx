/**
 * The gate. `/` is where the app opens and where a verdict push points, so this
 * route reads GET /profile once and hands the launch to intake or to the tabs.
 * It holds a blank screen in the app's own ground while the answer is in
 * flight, so the app never flashes a tab bar at someone who has not been
 * through onboarding.
 */
import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../components/assistant-ui/theme';
import { serverJson } from '../lib/server';
import type { ProfileResponse } from '../lib/types';

const COACH_TAB: Href = '/(tabs)/coach';
const ONBOARDING: Href = '/onboarding';

/**
 * A server that cannot be reached sends the user to the tabs rather than into
 * intake: the tabs show the error, and a profile that already exists is not
 * worth asking for twice.
 */
async function resolveDestination(): Promise<Href> {
  try {
    const { profile } = await serverJson<ProfileResponse>('/profile');
    return profile ? COACH_TAB : ONBOARDING;
  } catch {
    return COACH_TAB;
  }
}

/** One read of GET /profile on launch. `null` until it answers. */
function useDestination(): Href | null {
  const [destination, setDestination] = useState<Href | null>(null);

  useEffect(() => {
    let cancelled = false;

    const decide = async () => {
      const next = await resolveDestination();
      if (!cancelled) setDestination(next);
    };

    void decide();
    return () => {
      cancelled = true;
    };
  }, []);

  return destination;
}

export default function Index() {
  const { colors } = useTheme();
  const destination = useDestination();

  if (destination === null) {
    return <View style={[styles.ground, { backgroundColor: colors.background }]} />;
  }
  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  ground: {
    flex: 1,
  },
});
