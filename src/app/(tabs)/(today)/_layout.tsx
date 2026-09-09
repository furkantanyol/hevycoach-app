import { Stack } from 'expo-router';

import { useScreenAnimation } from '@/components/motion';

export default function TodayLayout() {
  const animation = useScreenAnimation();

  return (
    <Stack screenOptions={{ animation }}>
      <Stack.Screen name="index" options={{ title: 'Today', headerLargeTitle: true }} />
    </Stack>
  );
}
