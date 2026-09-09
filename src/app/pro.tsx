import { Redirect } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Rule } from '@/components/motion';
import { RuledButton } from '@/components/ruled-button';
import { Stamp } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
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
        <View style={styles.head}>
          <Stamp>Access</Stamp>
          <ThemedText type="subtitle" style={styles.title}>
            HevyCoach needs Hevy Pro
          </ThemedText>
          <Rule weight="ink" />
        </View>
        <ThemedText themeColor="inkSecondary">
          HevyCoach reads your training and writes routines through the Hevy API, and Hevy only
          opens that API to Pro accounts. Upgrade in Hevy, then check again here.
        </ThemedText>
        <View style={styles.actions}>
          <RuledButton
            title="See Hevy plans"
            onPress={() => void Linking.openURL(HEVY_PLANS_URL)}
            primary
          />
          <RuledButton title="Check again" onPress={pro.check} disabled={pro.checking} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const TITLE_SIZE = 22;
const TITLE_LINE_HEIGHT = 28;

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.two,
  },
  head: {
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: TITLE_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
  },
});
