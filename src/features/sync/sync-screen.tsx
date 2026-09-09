import { useNetworkState } from 'expo-network';
import { useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { RoutineEditor } from './routine-editor';
import { useSync } from './use-sync';
import { buildWeeklyContext } from './weekly-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDatabase } from '@/db/provider';
import { useAskCoach } from '@/features/coach/use-ask-coach';
import { getApiKey } from '@/features/settings/api-key';
import { useTheme } from '@/hooks/use-theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.value} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

export default function SyncScreen() {
  const theme = useTheme();
  const db = useDatabase();
  const { isConnected } = useNetworkState();
  const { run, status, summary, error, counts } = useSync();
  const { ask, status: askStatus, answer, error: askError } = useAskCoach();
  const state = counts.state;

  const [hasApiKey, setHasApiKey] = useState(false);
  const apiKeyCheckCancelled = useRef(false);

  useEffect(() => {
    getApiKey().then((apiKey) => {
      if (!apiKeyCheckCancelled.current) {
        setHasApiKey(Boolean(apiKey));
      }
    });
    return () => {
      apiKeyCheckCancelled.current = true;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Row label="Network" value={describeNetwork(isConnected)} />

        <View style={styles.section}>
          <ThemedText type="subtitle">Local database</ThemedText>
          <Row label="Workouts" value={String(counts.workouts)} />
          <Row label="Sets" value={String(counts.sets)} />
          <Row label="Routines" value={String(counts.routines)} />
          <Row
            label="Backfill"
            value={state?.backfillDone ? 'complete' : `page ${state?.backfillPage ?? 1}`}
          />
          <Row label="Cursor" value={state?.workoutsCursor ?? 'not set'} />
          <Row label="Last sync" value={state?.lastSyncAt?.toISOString() ?? 'never'} />
          {state?.lastError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {state.lastError}
            </ThemedText>
          ) : null}
        </View>

        <Button title="Sync now" onPress={() => run()} disabled={status === 'pending'} />

        <ThemedText type="small" themeColor="textSecondary">
          {describeSync({ status, summary, error })}
        </ThemedText>

        <View style={styles.section}>
          <ThemedText type="subtitle">Outbox</ThemedText>
          <Row label="Queued" value={String(counts.pendingWrites)} />
          <Row label="Retrying" value={String(counts.retryingWrites)} />
          <Row label="Given up" value={String(counts.deadWrites)} />
          {counts.lastWriteError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {counts.lastWriteError}
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">Rename a routine</ThemedText>
          <RoutineEditor />
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">Coach</ThemedText>
          <Button
            title="Ask about last week"
            onPress={() => ask({ subject: 'block', context: buildWeeklyContext(db) })}
            disabled={!hasApiKey || isConnected === false || askStatus === 'pending'}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {describeCoach({ status: askStatus, error: askError })}
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
      </ScrollView>
    </ThemedView>
  );
}

/** expo-network reports nothing until its first read resolves, so say so rather than say offline. */
function describeNetwork(isConnected: boolean | undefined): string {
  if (isConnected === undefined) {
    return 'checking…';
  }

  return isConnected ? 'Online' : 'Offline';
}

type SyncDescription = Pick<ReturnType<typeof useSync>, 'status' | 'summary' | 'error'>;

function describeSync({ status, summary, error }: SyncDescription): string {
  if (status === 'pending') {
    return 'Syncing…';
  }
  if (status === 'error') {
    return error ?? 'Sync failed.';
  }
  if (summary?.status === 'offline') {
    return 'Offline — nothing was lost, the queue and cursors are untouched.';
  }
  if (summary) {
    const backfill = summary.backfillDone ? '' : ' — history still backfilling';

    return `Sent ${summary.sent}, updated ${summary.workoutsUpserted}, removed ${summary.workoutsDeleted}.${backfill}`;
  }

  return 'Pull your Hevy history down and push queued writes back up.';
}

type CoachDescription = { status: ReturnType<typeof useAskCoach>['status']; error: string | null };

function describeCoach({ status, error }: CoachDescription): string {
  if (status === 'pending') {
    return 'Asking the coach…';
  }
  if (status === 'error') {
    return error ?? 'The coach could not answer.';
  }
  return 'Builds a summary of the last 7 days from your local data and asks the coach to explain it.';
}

const ANSWER_MIN_HEIGHT = 96;

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  value: {
    flexShrink: 1,
  },
  answer: {
    minHeight: ANSWER_MIN_HEIGHT,
    padding: Spacing.two,
  },
});
