import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { coachFetch } from './coach-adapter';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function easProjectId(): string | undefined {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExtra === 'string') return fromExtra;
  return Constants.easConfig?.projectId;
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return requested.granted;
}

/**
 * Asks for notification permission, then hands the Expo push token to the
 * coach server. Silent when the user says no; never throws — a failure here
 * must not stop the thread from rendering.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!(await ensurePermission())) return;

    const projectId = easProjectId();
    if (!projectId) {
      console.warn('[push] no EAS projectId in app config; skipping push registration');
      return;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const response = await coachFetch('/device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expoPushToken: token.data }),
    });
    if (!response.ok) {
      console.warn(`[push] server rejected the token: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn('[push] registration failed', error);
  }
}
