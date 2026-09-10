/**
 * The pills under the coach's last message. The wire shape is
 * `metadata.custom = { kind, choices }` — see the Messages-with-choices
 * section of docs/spec.md and `toMessageLike` in src/coach-adapter.ts.
 *
 * One tap sends: a question with more than one answer loops on the server,
 * asking again with what is left, so nothing is ever collected here first.
 *
 * A tap appends a normal user turn whose `metadata.custom.choice` carries the
 * value: `ThreadRuntime.append` accepts metadata (CreateAppendMessage in
 * @assistant-ui/core), the local runtime keeps it on the stored message, and
 * the chat adapter reads it back off the last user message. Nothing is encoded
 * in the text. Once that turn lands the coach's message is no longer last, so
 * the pills go on their own.
 */
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Choice } from '../../lib/types';
import { useTheme } from './theme';

const PILL_HEIGHT = 44;
const PILL_RADIUS = 22;
const PRESSED_OPACITY = 0.7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readChoices(custom: Record<string, unknown>): readonly Choice[] {
  const { choices } = custom;
  if (!Array.isArray(choices)) return [];
  return choices.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return [];
    const { label, value } = entry;
    if (typeof label !== 'string' || typeof value !== 'string') return [];
    return [{ label, value }];
  });
}

function Pill({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.muted },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function useSendChoice(): (text: string, choice: string) => void {
  const aui = useAui();
  return useCallback(
    (text, choice) => {
      aui.thread.append({
        role: 'user',
        content: [{ type: 'text', text }],
        metadata: { custom: { choice } },
      });
    },
    [aui],
  );
}

export function ChoicePills() {
  const custom = useAuiState((s) => s.message.metadata.custom);
  const isLast = useAuiState((s) => s.message.isLast);
  const choices = useMemo(() => readChoices(custom), [custom]);
  const send = useSendChoice();

  if (choices.length === 0 || !isLast) return null;

  return (
    <View style={styles.row}>
      {choices.map((choice) => (
        <Pill
          key={choice.value}
          label={choice.label}
          onPress={() => send(choice.label, choice.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  pill: {
    minHeight: PILL_HEIGHT,
    justifyContent: 'center',
    borderRadius: PILL_RADIUS,
    paddingHorizontal: 18,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});
