import { useEffect, useState } from 'react';
import { Button, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useHealthExport, type ExportStatus } from '@/features/health/use-health-export';
import { getApiKey, setApiKey } from '@/features/settings/api-key';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useTheme } from '@/hooks/use-theme';
import { HealthExport, type ExportResult } from '@/modules/health-export';

export default function SettingsScreen() {
  const theme = useTheme();
  const exportEnabled = useSettingsStore((state) => state.exportEnabled);
  const setExportEnabled = useSettingsStore((state) => state.setExportEnabled);
  const { run, status, result, error } = useHealthExport();

  const [healthAvailable] = useState(() => HealthExport.isAvailable());
  const [draftKey, setDraftKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  useEffect(() => {
    getApiKey().then((apiKey) => setKeySaved(Boolean(apiKey)));
  }, []);

  const saveKey = async () => {
    await setApiKey(draftKey.trim());
    setDraftKey('');
    setKeySaved(true);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.section}>
        <ThemedText type="subtitle">Hevy API key</ThemedText>
        <TextInput
          value={draftKey}
          onChangeText={setDraftKey}
          placeholder={keySaved ? 'Key saved — paste a new one to replace it' : 'Paste your API key'}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <Button title="Save" onPress={saveKey} disabled={draftKey.trim().length === 0} />
      </View>

      <View style={styles.row}>
        <ThemedText>Export to Apple Health</ThemedText>
        <Switch value={exportEnabled} onValueChange={setExportEnabled} disabled={!healthAvailable} />
      </View>

      <Button
        title="Export last 10 workouts"
        onPress={run}
        disabled={!exportEnabled || !keySaved || !healthAvailable || status === 'running'}
      />

      <ThemedText type="small" themeColor="textSecondary">
        {describeStatus({ healthAvailable, status, result, error })}
      </ThemedText>
    </ThemedView>
  );
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
  return 'Already-exported workouts are skipped unless they changed in Hevy.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
