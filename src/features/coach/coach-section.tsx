import type { Workout } from '@furkantanyol/hevy-client';
import { useNetworkState } from 'expo-network';
import { Button, StyleSheet, TextInput, View } from 'react-native';

import { useAskCoach } from './use-ask-coach';
import { buildWeeklyContext, CONTEXT_WINDOW_DAYS } from './weekly-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CoachSectionProps = {
  /** The window the review is already showing. Undefined until Hevy has answered. */
  readonly workouts: readonly Workout[] | undefined;
  readonly workoutsError: Error | null;
};

/**
 * Asking about last week belongs on the screen that shows last week. The user's own summary goes
 * up and coaching comes back; nothing here produces a number.
 */
export function CoachSection({ workouts, workoutsError }: CoachSectionProps) {
  const theme = useTheme();
  const { isConnected } = useNetworkState();
  const { ask, status, answer, error } = useAskCoach();

  const offline = isConnected === false;
  const canAsk = !offline && workouts !== undefined && status !== 'pending';

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Coach</ThemedText>
      <Button
        title="Ask about last week"
        onPress={() => {
          if (workouts) {
            ask({ subject: 'block', context: buildWeeklyContext(workouts) });
          }
        }}
        disabled={!canAsk}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {describeCoach({ status, error, workoutsError, offline })}
      </ThemedText>
      <TextInput
        value={answer ?? ''}
        editable={false}
        multiline
        placeholder="The coach's answer will appear here."
        placeholderTextColor={theme.textSecondary}
        style={[styles.answer, { color: theme.text }]}
      />
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

const ANSWER_MIN_HEIGHT = 96;

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.five,
  },
  answer: {
    minHeight: ANSWER_MIN_HEIGHT,
    padding: Spacing.two,
  },
});
