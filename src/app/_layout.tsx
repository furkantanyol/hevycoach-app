/**
 * The root: one route under a native header, push registration, and the
 * notification observer. There is nowhere to navigate — the app is a single
 * screen — so a tap on a review push bumps the reload counter in
 * src/lib/reload.ts and the thread remounts on the new key with the server's
 * history.
 *
 * The header is transparent (`headerTransparent`, expo-router's
 * NativeStackNavigationOptions): it hands the native bar a transparent
 * background and an absolute position, so the screen's wash runs behind the
 * title unbroken instead of stopping at a white band. `headerBlurEffect` is
 * deliberately left unset — it would paint a material back over the wash, the
 * band this removes, and react-native-screens warns it can also overlap iOS 26
 * scroll edge effects. The transparent bar drops its own hairline with it
 * (`headerShadowVisible` defaults to hidden once the header is transparent).
 *
 * Because the bar now floats, the screen is laid out from the top of the
 * display and insets itself by the bar's height (src/app/index.tsx).
 */
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { bumpReload } from '../lib/reload';
import { registerForPush } from '../push';

const SCREEN_TITLE = 'Coach';

/**
 * Clearing the stored response keeps the same tap from being replayed on the
 * next launch. Every push the server sends points at the thread, so the `url`
 * it carries needs no inspection.
 */
function openNotification(_response: Notifications.NotificationResponse) {
  Notifications.clearLastNotificationResponse();
  bumpReload();
}

function usePushNotifications() {
  useEffect(() => {
    void registerForPush();

    // A tap that launched the app is already answered: the thread mounts with
    // this effect and reads the server's history on that first mount, so the
    // stored response is dropped rather than bumped — bumping would remount
    // the thread and fetch the same history a second time. Only a tap that
    // arrives while the app is running reaches the listener, and that one
    // does need the reload.
    Notifications.clearLastNotificationResponse();
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  usePushNotifications();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: SCREEN_TITLE,
          headerLargeTitleEnabled: false,
          headerTransparent: true,
        }}
      />
    </Stack>
  );
}
