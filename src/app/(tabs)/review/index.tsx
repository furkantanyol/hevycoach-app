import type { Workout } from '@furkantanyol/hevy-client';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { describeMissingData } from '@/features/hevy/describe-query';
import { useRecentWorkouts } from '@/features/hevy/queries';
import { describeLoggedSet, formatDate } from '@/features/lifts/format';
import { LiftLink } from '@/features/lifts/lift-link';

const LIFT_DETAIL_PATHNAME = '/review/lift/[templateId]' as const;

/**
 * The week as it was actually trained. What changed and why arrives with the rules engine; until
 * then this reports the sessions themselves and nothing derived from them.
 */
export default function ReviewScreen() {
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS);
  const sessions = workouts.data ?? [];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary">
          {sessions.length > 0
            ? `Last ${CONTEXT_WINDOW_DAYS} days`
            : describeMissingData(workouts, 'Nothing logged in Hevy yet.')}
        </ThemedText>
        {sessions.map((workout) => (
          <SessionBlock key={workout.id} workout={workout} />
        ))}
      </ScrollView>
    </ThemedView>
  );
}

function SessionBlock({ workout }: { workout: Workout }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{workout.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDate(workout.start_time)}
      </ThemedText>
      {workout.exercises.map((exercise) => (
        <LiftLink
          key={`${exercise.index}-${exercise.exercise_template_id}`}
          pathname={LIFT_DETAIL_PATHNAME}
          templateId={exercise.exercise_template_id}
          title={exercise.title}
          detail={exercise.sets.map(describeLoggedSet).join('   ')}
        />
      ))}
    </View>
  );
}

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
});
