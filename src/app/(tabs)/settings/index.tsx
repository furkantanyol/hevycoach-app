import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
import { useHealthExport, type ExportStatus } from '@/features/health/use-health-export';
import { resetHevyQueries } from '@/features/hevy/queries';
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
    <ThemedView style={Screen.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={Screen.scrollContent}>
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
      </ScrollView>
    </ThemedView>
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

const MIN_TAP_TARGET = 44;

const styles = StyleSheet.create({
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
});
