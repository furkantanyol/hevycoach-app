import { Stack } from 'expo-router';

import { useScreenAnimation } from '@/components/motion';

/** Lift detail is pushed inside this stack, so the tab bar stays and Back returns to Review. */
export default function ReviewLayout() {
  const animation = useScreenAnimation();

  return (
    <Stack screenOptions={{ animation }}>
      <Stack.Screen name="index" options={{ title: 'Review', headerLargeTitle: true }} />
    </Stack>
  );
}
