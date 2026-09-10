/**
 * The root: push registration, the notification observer, and the gate that
 * decides between the tabs and intake. The gate holds a blank screen in the
 * app's own ground until GET /profile answers, so the app never flashes a tab
 * bar at someone who has not been through onboarding.
 */
import * as Notifications from 'expo-notifications';
import { router, Stack, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../components/assistant-ui/theme';
import { serverJson } from '../lib/server';
import type { ProfileResponse } from '../lib/types';
import { registerForPush } from '../push';

const COACH_TAB: Href = '/(tabs)/coach';
const ONBOARDING: Href = '/onboarding';
/** The only `url` the server sends with a verdict push (server/src/routes.ts). */
const PUSH_THREAD_URL = '/';

function pushUrl(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { url } = data as { url?: unknown };
  return typeof url === 'string' ? url : null;
}

/**
 * A verdict push carries `{ url: '/' }`, which is the thread — the Coach tab.
 * Clearing the stored response keeps the same tap from being replayed on the
 * next launch.
 */
function openNotification(response: Notifications.NotificationResponse) {
  const url = pushUrl(response.notification.request.content.data);
  Notifications.clearLastNotificationResponse();
  if (url === null || url === PUSH_THREAD_URL) router.push(COACH_TAB);
}

function usePushRouting() {
  useEffect(() => {
    void registerForPush();

    const last = Notifications.getLastNotificationResponse();
    if (last) openNotification(last);
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => subscription.remove();
  }, []);
}

/**
 * One read of GET /profile on launch. A server that cannot be reached sends the
 * user to the tabs rather than into intake: the tabs show the error, and a
 * profile that already exists is not worth asking for twice.
 */
function useProfileGate(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const decide = async () => {
      let destination = COACH_TAB;
      try {
        const { profile } = await serverJson<ProfileResponse>('/profile');
        if (!profile) destination = ONBOARDING;
      } catch {
        destination = COACH_TAB;
      }
      if (cancelled) return;
      router.replace(destination);
      setReady(true);
    };

    void decide();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}

export default function RootLayout() {
  const { colors } = useTheme();
  usePushRouting();
  const ready = useProfileGate();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack>
      {ready ? null : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
