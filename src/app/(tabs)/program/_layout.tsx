import { Stack } from 'expo-router';

import { useScreenAnimation } from '@/hooks/use-screen-animation';

/** Lift detail is pushed inside this stack, so the tab bar stays and Back returns to Program. */
export default function ProgramLayout() {
  const animation = useScreenAnimation();

  return (
    <Stack screenOptions={{ animation }}>
      <Stack.Screen name="index" options={{ title: 'Program', headerLargeTitle: true }} />
    </Stack>
  );
}
