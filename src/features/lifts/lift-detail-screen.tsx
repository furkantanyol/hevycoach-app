import type { ExerciseHistoryEntry } from '@furkantanyol/hevy-client';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SectionList, StyleSheet, View } from 'react-native';

import { describeLoggedSet, formatDate } from './format';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { describeMissingData } from '@/features/hevy/describe-query';
import { useExerciseHistory } from '@/features/hevy/queries';

type LiftParams = {
  readonly templateId: string;
  readonly title?: string;
};

type LoggedSession = {
  readonly title: string;
  readonly data: ExerciseHistoryEntry[];
};

const FALLBACK_TITLE = 'Lift';

/** The API returns one flat entry per set, newest workout first; sessions are its natural grouping. */
function toSessions(entries: readonly ExerciseHistoryEntry[]): LoggedSession[] {
  const byWorkout = new Map<string, LoggedSession>();

  for (const entry of entries) {
    const session = byWorkout.get(entry.workout_id);
    if (session) {
      session.data.push(entry);
    } else {
      byWorkout.set(entry.workout_id, {
        title: `${formatDate(entry.workout_start_time)} · ${entry.workout_title}`,
        data: [entry],
      });
    }
  }

  return [...byWorkout.values()];
}

/**
 * One exercise, as the user has actually logged it. Pushed from Program and from Review, so it is
 * a detail screen in both stacks and keeps an inline title.
 */
export default function LiftDetailScreen() {
  const { templateId, title } = useLocalSearchParams<LiftParams>();
  const history = useExerciseHistory(templateId);
  const sessions = toSessions(history.data ?? []);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: title ?? FALLBACK_TITLE }} />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        sections={sessions}
        keyExtractor={(entry, index) => `${entry.workout_id}-${index}`}
        renderSectionHeader={({ section }) => (
          <ThemedText type="small" themeColor="textSecondary">
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <View style={styles.setRow}>
            <ThemedText>{describeLoggedSet(item)}</ThemedText>
          </View>
        )}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary">
            {describeMissingData(history, 'No logged sets for this exercise yet.')}
          </ThemedText>
        }
      />
    </ThemedView>
  );
}

const MIN_ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.two,
    padding: Spacing.four,
  },
  setRow: {
    minHeight: MIN_ROW_HEIGHT,
    justifyContent: 'center',
  },
});
