import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Sync is iOS-only: the web bundle has no SQLite, so it never imports the sync feature. */
export default function SyncWebScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">iOS only</ThemedText>
      <ThemedText themeColor="textSecondary">
        Offline sync stores your history in SQLite on the device. Open HevyCoach on iOS to use it.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
