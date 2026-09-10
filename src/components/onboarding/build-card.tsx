/**
 * The coach's reply to "Build my block.", streaming into a card. It is the
 * thread's own rendering without the thread: three fading dots until the first
 * chunk lands, then the tool's progress line in grey and the plan prose in the
 * reply colour. The dot values match `TypingIndicator` in
 * src/components/assistant-ui/message.tsx, which does not export them.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Radius, useTheme } from '../assistant-ui/theme';

/** `PROGRESS_LINE` and `PROGRESS_END` in server/src/coach.ts. */
const PROGRESS_LINE = 'Reading your history and writing your block';
const PROGRESS_END = '\n\n';

const DOT_FADE_MS = 400;
const DOT_DELAYS = [0, 160, 320];
const DOT_MIN_OPACITY = 0.3;

interface StreamedReply {
  readonly progress: string;
  readonly prose: string;
}

/**
 * The server writes the progress line, then one dot every 15 s, then a blank
 * line, then the plan. A reply that used no tool has no progress line at all.
 */
function splitReply(text: string): StreamedReply {
  const start = text.indexOf(PROGRESS_LINE);
  if (start < 0) return { progress: '', prose: text.trim() };
  const end = text.indexOf(PROGRESS_END, start);
  if (end < 0) return { progress: text.slice(start), prose: '' };
  return {
    progress: text.slice(start, end),
    prose: text.slice(end + PROGRESS_END.length).trim(),
  };
}

function TypingDot({ delay }: { readonly delay: number }) {
  const { colors } = useTheme();
  // useState, not useRef: this repo's react-hooks/refs rule forbids reading
  // `.current` during render, and the value must survive re-renders.
  const [opacity] = useState(() => new Animated.Value(DOT_MIN_OPACITY));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: DOT_FADE_MS, delay, useNativeDriver: true }),
        Animated.timing(opacity, {
          toValue: DOT_MIN_OPACITY,
          duration: DOT_FADE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, delay]);

  return <Animated.View style={[styles.dot, { opacity, backgroundColor: colors.mutedForeground }]} />;
}

function TypingDots() {
  return (
    <View style={styles.typing}>
      {DOT_DELAYS.map((delay) => (
        <TypingDot key={delay} delay={delay} />
      ))}
    </View>
  );
}

export function BuildCard({ text }: { readonly text: string }) {
  const { colors } = useTheme();
  const { progress, prose } = splitReply(text);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {progress.length > 0 ? (
        <Text style={[styles.progress, { color: colors.mutedForeground }]}>{progress}</Text>
      ) : null}
      {prose.length > 0 ? (
        <Text style={[styles.prose, { color: colors.foreground }]}>{prose}</Text>
      ) : null}
      {text.length === 0 ? <TypingDots /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  progress: {
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  prose: {
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 25,
  },
  typing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 4,
  },
  dot: {
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },
});
