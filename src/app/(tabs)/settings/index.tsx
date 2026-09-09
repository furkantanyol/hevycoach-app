import { useNetworkState } from 'expo-network';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAskCoach } from '@/features/coach/use-ask-coach';
import { buildWeeklyContext, CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { useHealthExport, type ExportStatus } from '@/features/health/use-health-export';
import { resetHevyQueries, useRecentWorkouts } from '@/features/hevy/queries';
import { useProCheck } from '@/features/pro/use-pro-check';
import { getApiKey, setApiKey } from '@/features/settings/api-key';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useTheme } from '@/hooks/use-theme';
import { HealthExport, type ExportResult } from '@/modules/health-export';

export default function SettingsScreen() {
  const theme = useTheme();
  const exportEnabled = useSettingsStore((state) => state.exportEnabled);
  const setExportEnabled = useSettingsStore((state) => state.setExportEnabled);
  const setProStatus = useSettingsStore((state) => state.setProStatus);
  const { run, status, result, error } = useHealthExport();
  const pro = useProCheck();

  const [healthAvailable] = useState(() => HealthExport.isAvailable());
  const [draftKey, setDraftKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  const initialReadCancelled = useRef(false);

  useEffect(() => {
    getApiKey().then((apiKey) => {
      if (!initialReadCancelled.current) {
        setKeySaved(Boolean(apiKey));
      }
    });
    return () => {
      initialReadCancelled.current = true;
    };
  }, []);

  const saveKey = async () => {
    initialReadCancelled.current = true;
    await setApiKey(draftKey.trim());
    resetHevyQueries();
    // A different key may be a different account, so the previous verdict no longer applies.
    setProStatus('unknown');
    setDraftKey('');
    setKeySaved(Boolean(await getApiKey()));
    pro.check();
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle">Hevy API key</ThemedText>
          <TextInput
            value={draftKey}
            onChangeText={setDraftKey}
            placeholder={
              keySaved ? 'Key saved — paste a new one to replace it' : 'Paste your API key'
            }
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <Button title="Save" onPress={saveKey} disabled={draftKey.trim().length === 0} />
          <ThemedText type="small" themeColor="textSecondary">
            {describePro({ status: pro.status, checking: pro.checking, keySaved })}
          </ThemedText>
          {pro.status === 'unknown' && keySaved ? (
            <Button title="Check again" onPress={pro.check} disabled={pro.checking} />
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">Training profile</ThemedText>
          <Link href="/onboarding" asChild>
            <Pressable accessibilityRole="button" style={styles.linkRow}>
              <ThemedText type="linkPrimary">Edit your five answers</ThemedText>
            </Pressable>
          </Link>
        </View>

        <View style={styles.row}>
          <ThemedText>Export to Apple Health</ThemedText>
          <Switch
            value={exportEnabled}
            onValueChange={setExportEnabled}
            disabled={!healthAvailable}
          />
        </View>

        <Button
          title="Export last 10 workouts"
          onPress={run}
          disabled={!exportEnabled || !keySaved || !healthAvailable || status === 'running'}
        />

        <ThemedText type="small" themeColor="textSecondary">
          {describeStatus({ healthAvailable, status, result, error })}
        </ThemedText>

        <CoachSection hasApiKey={keySaved} />
      </ScrollView>
    </ThemedView>
  );
}

/** Phase C moves this into the Week review screen, where asking about last week belongs. */
function CoachSection({ hasApiKey }: { hasApiKey: boolean }) {
  const theme = useTheme();
  const { isConnected } = useNetworkState();
  const { ask, status, answer, error } = useAskCoach();
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS, { enabled: hasApiKey });

  const offline = isConnected === false;
  const canAsk = hasApiKey && !offline && workouts.data !== undefined && status !== 'pending';

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Coach</ThemedText>
      <Button
        title="Ask about last week"
        onPress={() => {
          if (workouts.data) {
            ask({ subject: 'block', context: buildWeeklyContext(workouts.data) });
          }
        }}
        disabled={!canAsk}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {describeCoach({ status, error, workoutsError: workouts.error })}
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

type ProDescription = {
  readonly status: ReturnType<typeof useProCheck>['status'];
  readonly checking: boolean;
  readonly keySaved: boolean;
};

function describePro({ status, checking, keySaved }: ProDescription): string {
  if (!keySaved) {
    return 'The Hevy API is a Pro feature. Save your key and HevyCoach checks it once.';
  }
  if (checking) {
    return 'Checking your Hevy Pro subscription…';
  }
  if (status === 'pro') {
    return 'Hevy Pro confirmed.';
  }
  if (status === 'not-pro') {
    return 'Hevy did not accept that key for the API, which needs Hevy Pro.';
  }
  return 'Could not reach Hevy to check your subscription. Nothing is locked — try again.';
}

type StatusDescription = {
  healthAvailable: boolean;
  status: ExportStatus;
  result: ExportResult | null;
  error: string | null;
};

function describeStatus({ healthAvailable, status, result, error }: StatusDescription): string {
  if (!healthAvailable) {
    return 'Apple Health is not available on this device.';
  }
  if (status === 'running') {
    return 'Exporting…';
  }
  if (status === 'error') {
    return error ?? 'Export failed.';
  }
  if (status === 'done' && result) {
    return `Saved ${result.saved}, skipped ${result.skipped}, failed ${result.failed}.`;
  }
  return 'Already-exported workouts are skipped unless they changed in Hevy. Energy is an estimate.';
}

type CoachDescription = {
  status: ReturnType<typeof useAskCoach>['status'];
  error: string | null;
  workoutsError: Error | null;
};

function describeCoach({ status, error, workoutsError }: CoachDescription): string {
  if (status === 'pending') {
    return 'Asking the coach…';
  }
  if (status === 'error') {
    return error ?? 'The coach could not answer.';
  }
  if (workoutsError) {
    return workoutsError.message;
  }
  return `Summarises your last ${CONTEXT_WINDOW_DAYS} days from Hevy and asks the coach to explain it.`;
}

const ANSWER_MIN_HEIGHT = 96;
const MIN_TAP_TARGET = 44;

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
  },
  linkRow: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  answer: {
    minHeight: ANSWER_MIN_HEIGHT,
    padding: Spacing.two,
  },
});
