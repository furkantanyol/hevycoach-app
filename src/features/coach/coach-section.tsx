import type { Workout } from '@furkantanyol/hevy-client';
import { useNetworkState } from 'expo-network';
import { StyleSheet, View } from 'react-native';

import { useAskCoach } from './use-ask-coach';
import { buildWeeklyContext, CONTEXT_WINDOW_DAYS } from './weekly-context';

import { Rule } from '@/components/motion';
import { RuledButton } from '@/components/ruled-button';
import { Stamp } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type CoachSectionProps = {
  /** The window the review is already showing. Undefined until Hevy has answered. */
  readonly workouts: readonly Workout[] | undefined;
  readonly workoutsError: Error | null;
};

/**
 * Asking about last week belongs on the screen that shows last week. The user's own summary goes
 * up and coaching comes back as prose; nothing here produces a number, so nothing here is a figure.
 */
export function CoachSection({ workouts, workoutsError }: CoachSectionProps) {
  const { isConnected } = useNetworkState();
  const { ask, status, answer, error } = useAskCoach();

  const offline = isConnected === false;
  const canAsk = !offline && workouts !== undefined && status !== 'pending';

  return (
    <View style={styles.section}>
      <Stamp>Coach</Stamp>
      <Rule weight="ink" />
      <ThemedText type="small" themeColor="inkSecondary" style={styles.status}>
        {describeCoach({ status, error, workoutsError, offline })}
      </ThemedText>
      <RuledButton
        title="Ask about last week"
        onPress={() => {
          if (workouts) {
            ask({ subject: 'block', context: buildWeeklyContext(workouts) });
          }
        }}
        disabled={!canAsk}
      />
      {answer ? (
        <ThemedText selectable style={styles.answer}>
          {answer}
        </ThemedText>
      ) : null}
    </View>
  );
}

type CoachDescription = {
  readonly status: ReturnType<typeof useAskCoach>['status'];
  readonly error: string | null;
  readonly workoutsError: Error | null;
  readonly offline: boolean;
};

function describeCoach({ status, error, workoutsError, offline }: CoachDescription): string {
  if (status === 'pending') {
    return 'Asking the coach…';
  }
  if (status === 'error') {
    return error ?? 'The coach could not answer.';
  }
  if (offline) {
    return 'Offline. The coach needs a connection; your training above does not.';
  }
  if (workoutsError) {
    return workoutsError.message;
  }
  return `Summarises your last ${CONTEXT_WINDOW_DAYS} days from Hevy and asks the coach to explain it.`;
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.six,
  },
  status: {
    paddingTop: Spacing.two,
  },
  answer: {
    paddingTop: Spacing.two,
  },
});
