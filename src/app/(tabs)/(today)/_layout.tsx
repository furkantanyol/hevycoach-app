import { Stack } from 'expo-router';

import { useScreenAnimation } from '@/components/motion';

/**
 * Today is the one top-level screen without a large title. The contract puts the first target at
 * the top of the sheet and calls it the largest thing on screen, and a 34pt large title sitting
 * above it would take that back. The tab bar already names the section, and the inline title keeps
 * the header, its material and the safe area exactly as iOS draws them elsewhere.
 */
export default function TodayLayout() {
  const animation = useScreenAnimation();

  return (
    <Stack screenOptions={{ animation }}>
      <Stack.Screen name="index" options={{ title: 'Today' }} />
    </Stack>
  );
}
