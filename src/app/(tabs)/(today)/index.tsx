import type { RoutineExercise } from '@furkantanyol/hevy-client';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import { Appear } from '@/components/appear';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { useExerciseHistory, useRecentWorkouts, useRoutines } from '@/features/hevy/queries';
import { QueryStatus } from '@/features/hevy/query-status';
import { describeLoggedSet, describeTargetSets, formatDate } from '@/features/lifts/format';
import { toSessions } from '@/features/lifts/history';
import { pickNextRoutine, type NextSession } from '@/features/today/next-routine';

const NO_ROUTINES = 'No routines saved in Hevy yet. Build one in Hevy and it shows up here.';

/**
 * The session to do now, read one-handed between sets. Every number on it is Hevy's own — the
 * routine's targets, and the sets the user logged last time — because the rules engine that will
 * own a computed target does not exist yet, and a made-up one would be worse than none.
 */
export default function TodayScreen() {
  const routines = useRoutines();
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS);

  const next = pickNextRoutine(routines.data ?? [], workouts.data ?? []);
  const exercises = next?.routine.exercises ?? [];

  return (
    <ThemedView style={styles.container}>
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={exercises}
        keyExtractor={(exercise) => `${exercise.index}-${exercise.exercise_template_id}`}
        ListHeaderComponent={<SessionHeader next={next} />}
        ListEmptyComponent={
          <QueryStatus
            query={routines}
            hasRows={false}
            whenEmpty={
              next === null ? NO_ROUTINES : `${next.routine.title} has no exercises in Hevy yet.`
            }
          />
        }
        renderItem={({ item }) => <ExerciseRow exercise={item} />}
      />
    </ThemedView>
  );
}

function SessionHeader({ next }: { next: NextSession | null }) {
  return (
    <Appear visible={next !== null} style={styles.header}>
      <ThemedText type="subtitle">{next?.routine.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {next ? describeOrigin(next) : null}
      </ThemedText>
    </Appear>
  );
}

/** Where this session came from, so the user is never shown a choice without its reason. */
function describeOrigin(next: NextSession): string {
  if (next.after === null) {
    return 'First in your Hevy routines.';
  }
  return `Next in your Hevy routines after ${next.after.title} on ${formatDate(next.after.start_time)}.`;
}

/**
 * One exercise: the routine's own target, and what the user last actually logged against it. The
 * two are never reconciled into a third number here.
 */
function ExerciseRow({ exercise }: { exercise: RoutineExercise }) {
  const history = useExerciseHistory(exercise.exercise_template_id);
  const previous = toSessions(history.data ?? []).at(0);

  return (
    <View style={styles.row}>
      <ThemedText>{exercise.title}</ThemedText>
      <View style={styles.line}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          Target
        </ThemedText>
        <ThemedText style={styles.valueText}>{describeTargetSets(exercise.sets)}</ThemedText>
      </View>
      <View style={styles.line}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          Last
        </ThemedText>
        <View style={styles.value}>
          {previous ? (
            <>
              <ThemedText>{previous.sets.map(describeLoggedSet).join('   ')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDate(previous.startTime)}
              </ThemedText>
            </>
          ) : (
            <QueryStatus query={history} hasRows={false} whenEmpty="Never logged in Hevy." />
          )}
        </View>
      </View>
    </View>
  );
}

const LABEL_WIDTH = 56;
const MIN_ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
  },
  header: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  row: {
    minHeight: MIN_ROW_HEIGHT,
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  line: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  label: {
    width: LABEL_WIDTH,
  },
  value: {
    flex: 1,
    gap: Spacing.half,
  },
  valueText: {
    flex: 1,
  },
});
