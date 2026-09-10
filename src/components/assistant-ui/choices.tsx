/**
 * The pills under the coach's last message. The wire shape is
 * `metadata.custom = { kind, choices, multi }` — see the Messages-with-choices
 * section of docs/spec.md and `toMessageLike` in src/coach-adapter.ts.
 *
 * A tap appends a normal user turn whose `metadata.custom.choice` carries the
 * value: `ThreadRuntime.append` accepts metadata (CreateAppendMessage in
 * @assistant-ui/core), the local runtime keeps it on the stored message, and
 * the chat adapter reads it back off the last user message. Nothing is encoded
 * in the text. Once that turn lands the coach's message is no longer last, so
 * the pills go on their own.
 */
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Choice } from '../../lib/types';
import { type Palette, useTheme } from './theme';

const PILL_HEIGHT = 44;
const PILL_RADIUS = 22;
const PRESSED_OPACITY = 0.7;
const DONE_LABEL = 'Done';
const LABEL_SEPARATOR = ', ';

type PillTone = 'fill' | 'selected' | 'outline';

interface PillSkin {
  readonly background: string;
  readonly border: string;
  readonly label: string;
}

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

/** The border is always drawn, so a tone change never moves a pill. */
function pillSkin(tone: PillTone, colors: Palette): PillSkin {
  if (tone === 'selected') {
    return { background: colors.accent, border: colors.accent, label: colors.accentForeground };
  }
  if (tone === 'outline') {
    return { background: colors.background, border: colors.accent, label: colors.accent };
  }
  return { background: colors.muted, border: colors.muted, label: colors.foreground };
}

function Pill({
  label,
  tone,
  onPress,
}: {
  readonly label: string;
  readonly tone: PillTone;
  readonly onPress: () => void;
}) {
  const { colors } = useTheme();
  const skin = pillSkin(tone, colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: tone === 'selected' }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: skin.background, borderColor: skin.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, { color: skin.label }]}>{label}</Text>
    </Pressable>
  );
}

function useSendChoice(): (text: string, choice: string | readonly string[]) => void {
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

function SingleChoices({ choices }: { readonly choices: readonly Choice[] }) {
  const send = useSendChoice();

  return (
    <View style={styles.row}>
      {choices.map((choice) => (
        <Pill
          key={choice.value}
          label={choice.label}
          tone="fill"
          onPress={() => send(choice.label, choice.value)}
        />
      ))}
    </View>
  );
}

/** Toggle as many as you like; "Done" appears once one is on and sends them. */
function MultiChoices({ choices }: { readonly choices: readonly Choice[] }) {
  const send = useSendChoice();
  const [selected, setSelected] = useState<readonly string[]>([]);

  const toggle = useCallback((value: string) => {
    setSelected((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  }, []);

  // Sent in the order the pills are shown, not the order they were tapped.
  const sendSelected = () => {
    const picked = choices.filter((choice) => selected.includes(choice.value));
    send(
      picked.map((choice) => choice.label).join(LABEL_SEPARATOR),
      picked.map((choice) => choice.value),
    );
  };

  return (
    <View style={styles.row}>
      {choices.map((choice) => (
        <Pill
          key={choice.value}
          label={choice.label}
          tone={selected.includes(choice.value) ? 'selected' : 'fill'}
          onPress={() => toggle(choice.value)}
        />
      ))}
      {selected.length > 0 ? (
        <Pill label={DONE_LABEL} tone="outline" onPress={sendSelected} />
      ) : null}
    </View>
  );
}

export function ChoicePills() {
  const custom = useAuiState((s) => s.message.metadata.custom);
  const isLast = useAuiState((s) => s.message.isLast);
  const choices = useMemo(() => readChoices(custom), [custom]);

  if (choices.length === 0 || !isLast) return null;
  if (custom.multi === true) return <MultiChoices choices={choices} />;
  return <SingleChoices choices={choices} />;
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
    borderWidth: 1,
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
