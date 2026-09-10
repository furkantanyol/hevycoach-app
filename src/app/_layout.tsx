/**
 * The root: push registration and the notification observer. The launch
 * decision between the tabs and intake belongs to the `/` route
 * (src/app/index.tsx) — a redirect needs a route to run from.
 */
import * as Notifications from 'expo-notifications';
import { router, Stack, type Href } from 'expo-router';
import { useEffect } from 'react';

import { registerForPush } from '../push';

const COACH_TAB: Href = '/(tabs)/coach';
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

export default function RootLayout() {
  usePushRouting();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
