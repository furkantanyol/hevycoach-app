import type { Workout } from '@furkantanyol/hevy-client';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { describeMissingData } from '@/features/hevy/describe-query';
import { useRecentWorkouts } from '@/features/hevy/queries';
import { describeLoggedSet, formatDate } from '@/features/lifts/format';

/**
 * The read surface between sets. It shows the session the coach has planned — which arrives with
 * the rules engine — and, until then, the last session the user actually logged in Hevy.
 */
export default function TodayScreen() {
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS);
  const latest = workouts.data?.at(0);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle">Planned</ThemedText>
          <ThemedText themeColor="textSecondary">
            Today&apos;s session appears here once a block has been generated.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">Last logged</ThemedText>
          {latest ? (
            <LoggedWorkout workout={latest} />
          ) : (
            <ThemedText themeColor="textSecondary">
              {describeMissingData(workouts, 'Nothing logged in Hevy yet.')}
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function LoggedWorkout({ workout }: { workout: Workout }) {
  return (
    <View style={styles.section}>
      <ThemedText>{workout.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDate(workout.start_time)}
      </ThemedText>
      {workout.exercises.map((exercise) => (
        <View key={`${exercise.index}-${exercise.exercise_template_id}`} style={styles.row}>
          <ThemedText>{exercise.title}</ThemedText>
          {exercise.sets.map((set) => (
            <ThemedText key={set.index} type="small" themeColor="textSecondary">
              {describeLoggedSet(set)}
            </ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
}

const MIN_ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    minHeight: MIN_ROW_HEIGHT,
    justifyContent: 'center',
  },
});
