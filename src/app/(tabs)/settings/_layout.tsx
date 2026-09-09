import { Stack } from 'expo-router';

import { useScreenAnimation } from '@/components/motion';

export default function SettingsLayout() {
  const animation = useScreenAnimation();

  return (
    <Stack screenOptions={{ animation }}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: true }} />
    </Stack>
  );
}
