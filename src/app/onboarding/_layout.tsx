/** Intake runs as its own headerless stack, shown instead of the tabs. */
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
