import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { registerForPush } from '../push';

/**
 * A verdict push has one destination and the app has one screen, so a tap only
 * has to bring the thread forward — which the OS already does. Clearing the
 * stored response keeps the same tap from being replayed on the next launch.
 * index.tsx reloads history when the app reaches the foreground.
 */
function handleNotificationTap() {
  Notifications.clearLastNotificationResponse();
}

export default function RootLayout() {
  useEffect(() => {
    void registerForPush();

    if (Notifications.getLastNotificationResponse()) handleNotificationTap();
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationTap,
    );
    return () => subscription.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
