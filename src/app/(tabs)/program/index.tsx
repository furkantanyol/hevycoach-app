import type { Routine } from '@furkantanyol/hevy-client';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { describeMissingData } from '@/features/hevy/describe-query';
import { useRoutines } from '@/features/hevy/queries';
import { describeTargetSet } from '@/features/lifts/format';
import { LiftLink } from '@/features/lifts/lift-link';

const LIFT_DETAIL_PATHNAME = '/program/lift/[templateId]' as const;

/**
 * The routines that exist in Hevy today, with the targets Hevy itself stores on them. The
 * generated block replaces this content once the rules engine can produce one.
 */
export default function ProgramScreen() {
  const routines = useRoutines();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {routines.data?.map((routine) => <RoutineBlock key={routine.id} routine={routine} />)}
        {routines.data?.length ? null : (
          <ThemedText themeColor="textSecondary">
            {describeMissingData(routines, 'No routines saved in Hevy yet.')}
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function RoutineBlock({ routine }: { routine: Routine }) {
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{routine.title}</ThemedText>
      {routine.exercises.map((exercise) => (
        <LiftLink
          key={`${exercise.index}-${exercise.exercise_template_id}`}
          pathname={LIFT_DETAIL_PATHNAME}
          templateId={exercise.exercise_template_id}
          title={exercise.title}
          detail={exercise.sets.map(describeTargetSet).join('   ')}
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
