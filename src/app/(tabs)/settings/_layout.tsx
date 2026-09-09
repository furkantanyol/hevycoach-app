import { Stack } from 'expo-router';

import { useScreenAnimation } from '@/hooks/use-screen-animation';

export default function SettingsLayout() {
  const animation = useScreenAnimation();

  return (
    <Stack screenOptions={{ animation }}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: true }} />
    </Stack>
  );
}
