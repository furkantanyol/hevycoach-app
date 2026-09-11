/**
 * The pills under the coach's last message. The wire shape is
 * `metadata.custom = { kind, choices, multi? }` — see the Messages-with-choices
 * section of docs/spec.md and `toMessageLike` in src/coach-adapter.ts.
 *
 * A single-answer question sends on the tap. A `multi` question's pills toggle
 * and write their labels into the composer's field, whose send button posts
 * them with their values attached (src/lib/selection.ts); an `exclusive` pill
 * ("Nothing") answers by itself, so it sends at once.
 *
 * A tap appends a normal user turn whose `metadata.custom.choice` carries the
 * value or values: `ThreadRuntime.append` accepts metadata (CreateAppendMessage
 * in @assistant-ui/core), the local runtime keeps it on the stored message, and
 * the chat adapter reads it back off the last user message. Nothing is encoded
 * in the text. Once that turn lands the coach's message is no longer last, so
 * the pills go on their own — fading out as the reply fades in, and the tapped
 * pill presses in under the finger, so the exchange moves instead of jumping.
 */
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { setSelection } from '../../lib/selection';
import type { Choice } from '../../lib/types';
import { useTheme } from './theme';

const PILL_HEIGHT = 44;
const PILL_RADIUS = 22;
const PRESSED_OPACITY = 0.7;
const PRESSED_SCALE = 0.96;
const ENTER_MS = 220;
const EXIT_MS = 140;
const MULTI_HINT = 'Select all that apply, then send';
const LABEL_SEPARATOR = ', ';
/** The accent at 15% behind a picked pill: chosen, not yet sent. Appended to the six-digit accent. */
const PICKED_ALPHA = '26';
/** Quick and settled: the press reads as feedback, not as motion. */
const PRESS_SPRING = { damping: 18, stiffness: 320 } as const;

/** Plain at rest; picked while it waits for "Done"; primary is the "Done" itself. */
type Tone = 'plain' | 'picked' | 'primary';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readChoices(custom: Record<string, unknown>): readonly Choice[] {
  const { choices } = custom;
  if (!Array.isArray(choices)) return [];
  return choices.flatMap((entry: unknown) => {
    if (!isRecord(entry)) return [];
    const { label, value, exclusive } = entry;
    if (typeof label !== 'string' || typeof value !== 'string') return [];
    return [{ label, value, ...(exclusive === true && { exclusive: true }) }];
  });
}

function pillColors({ colors }: ReturnType<typeof useTheme>, tone: Tone): { fill: string; text: string } {
  if (tone === 'primary') return { fill: colors.accent, text: colors.accentForeground };
  if (tone === 'picked') return { fill: `${colors.accent}${PICKED_ALPHA}`, text: colors.accent };
  return { fill: colors.muted, text: colors.foreground };
}

type PillProps = { readonly label: string; readonly tone?: Tone; readonly onPress: () => void };

function Pill({ label, tone = 'plain', onPress }: PillProps) {
  const { fill, text } = pillColors(useTheme(), tone);
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const pressIn = () => {
    scale.set(withSpring(PRESSED_SCALE, PRESS_SPRING));
  };
  const pressOut = () => {
    scale.set(withSpring(1, PRESS_SPRING));
  };

  return (
    <Animated.View style={pressed}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: tone === 'picked' }}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={onPress}
        style={({ pressed: isPressed }) => [styles.pill, { backgroundColor: fill }, isPressed && styles.pressed]}
      >
        <Text style={[styles.label, { color: text }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function useSendChoice(): (text: string, choice: string | string[]) => void {
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

/** One tap sends. */
function SinglePills({ choices }: { readonly choices: readonly Choice[] }) {
  const send = useSendChoice();

  return choices.map((choice) => (
    <Pill key={choice.value} label={choice.label} onPress={() => send(choice.label, choice.value)} />
  ));
}

/** Pills toggle into the composer's field, whose arrow sends them; an exclusive pill sends by itself. */
function MultiPills({ choices }: { readonly choices: readonly Choice[] }) {
  const aui = useAui();
  const send = useSendChoice();
  const [picked, setPicked] = useState<readonly string[]>([]);

  const toggle = (value: string) => {
    const next = picked.includes(value) ? picked.filter((entry) => entry !== value) : [...picked, value];
    const chosen = choices.filter((choice) => next.includes(choice.value));
    const text = chosen.map((choice) => choice.label).join(LABEL_SEPARATOR);
    setPicked(next);
    setSelection(chosen.length > 0 ? { text, values: chosen.map((choice) => choice.value) } : null);
    // Inside a message, `aui.composer` is that message's edit composer; the field the athlete types into is the thread's.
    aui.thread.composer().setText(text);
  };

  // The question answered, or no longer the last message: nothing is picked any more.
  useEffect(() => () => setSelection(null), []);

  return choices.map((choice) => (
    <Pill
      key={choice.value}
      label={choice.label}
      tone={picked.includes(choice.value) ? 'picked' : 'plain'}
      onPress={() => (choice.exclusive ? send(choice.label, [choice.value]) : toggle(choice.value))}
    />
  ));
}

export function ChoicePills() {
  const { colors } = useTheme();
  const custom = useAuiState((s) => s.message.metadata.custom);
  const isLast = useAuiState((s) => s.message.isLast);
  const choices = useMemo(() => readChoices(custom), [custom]);

  if (choices.length === 0 || !isLast) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(ENTER_MS)}
      exiting={FadeOut.duration(EXIT_MS)}
      layout={LinearTransition.duration(ENTER_MS)}
      style={styles.row}
    >
      {custom.multi === true && <Text style={[styles.hint, { color: colors.mutedForeground }]}>{MULTI_HINT}</Text>}
      {custom.multi === true ? <MultiPills choices={choices} /> : <SinglePills choices={choices} />}
    </Animated.View>
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
  hint: {
    width: '100%',
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.1,
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
