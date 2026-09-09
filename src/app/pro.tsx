import { Redirect } from 'expo-router';
import { Button, Linking, ScrollView } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/constants/theme';
import { useProCheck } from '@/features/pro/use-pro-check';

const HEVY_PLANS_URL = 'https://hevy.com/plans';

/**
 * The only entitlement screen. It is reached when Hevy refused the key for the API, which is a
 * Pro feature — never when the check merely failed to complete.
 */
export default function ProScreen() {
  const pro = useProCheck();

  if (pro.status !== 'not-pro') {
    return <Redirect href="/" />;
  }

  return (
    <ThemedView style={Screen.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={Screen.scrollContent}>
        <ThemedText type="subtitle">HevyCoach needs Hevy Pro</ThemedText>
        <ThemedText themeColor="textSecondary">
          HevyCoach reads your training and writes routines through the Hevy API, and Hevy only
          opens that API to Pro accounts. Upgrade in Hevy, then check again here.
        </ThemedText>
        <Button title="See Hevy plans" onPress={() => void Linking.openURL(HEVY_PLANS_URL)} />
        <Button title="Check again" onPress={pro.check} disabled={pro.checking} />
      </ScrollView>
    </ThemedView>
  );
}
