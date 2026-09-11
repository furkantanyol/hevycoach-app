import {
  ErrorPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartComponent,
} from '@assistant-ui/react-native';
import Markdown, { type MarkdownStyleMap } from '@ronradtke/react-native-markdown-display';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ChoicePills } from './choices';
import { ReviewCaption } from './coach-metadata';
import { PlanCards } from './plan-cards';
import { useSmooth } from '../../lib/use-smooth';
import { Radius, useTheme, type Palette } from './theme';

const DOT_FADE_MS = 400;
const DOT_MIN_OPACITY = 0.3;
const DOT_STAGGER_MS = 160;
/** A new bubble settles in from just below its place; the thread reads as a conversation arriving, not a list redrawing. */
const ENTER_MS = 220;
/** The server marks a status for the wait; the app appends the ellipsis so it reads as in progress. */
const REVIEWING = 'Reviewing it now';
const ELLIPSIS = '…';
/** Between paragraphs, lists and headings — the 8pt rhythm, not the library's 10. */
const BLOCK_GAP = 8;
/** A burst (the model writes 400 characters in two seconds) types out over about a second and a half; a slow trickle is not held back. */
const SMOOTH = { drainMs: 1500, maxCharIntervalMs: 12 } as const;
const hasLineBreak = (text: string): boolean => text.includes('\n');
const LIST_GAP = 4;
/** The coach writes short headings, so they sit one step above the body, not four. */
const HEADING_TEXT = { fontSize: 17, lineHeight: 24, fontWeight: '700' } as const;
/** 22, not 25: on the New Architecture a line height far above the font's own drops the last line of a long paragraph (seen live 2026-09-11, twice). */
const ASSISTANT_TEXT = { fontSize: 16, lineHeight: 22, letterSpacing: -0.2 } as const;

/**
 * Bold, bullets and short headings are all the coach writes, so the map tunes
 * those keys and leaves the rest of the library's sheet alone (`mergeStyle` is
 * on by default, so each key merges over the base). Text properties set on
 * `body` cascade to every leaf — that is how the bubble's own type reaches the
 * markdown — while `gap` stays on the root View and spaces the blocks.
 */
function markdownStyles(colors: Palette): MarkdownStyleMap {
  const heading = { ...HEADING_TEXT, color: colors.foreground, marginTop: BLOCK_GAP };
  return {
    body: { ...ASSISTANT_TEXT, color: colors.foreground, gap: BLOCK_GAP },
    paragraph: { marginTop: 0, marginBottom: 0 },
    strong: { fontWeight: '700' },
    heading1: heading,
    heading2: heading,
    heading3: heading,
    bullet_list: { gap: LIST_GAP },
    ordered_list: { gap: LIST_GAP },
    list_item: { gap: LIST_GAP },
    bullet_list_icon: { marginLeft: 0, marginRight: 0 },
    ordered_list_icon: { marginLeft: 0, marginRight: 0 },
    code_inline: {
      backgroundColor: colors.muted,
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.md,
      color: colors.foreground,
      paddingHorizontal: 4,
      paddingVertical: 0,
    },
  };
}

const UserText: TextMessagePartComponent = ({ text }) => {
  const { colors } = useTheme();
  return <Text style={[styles.userText, { color: colors.accentForeground }]}>{text}</Text>;
};

/**
 * One bubble per text part, markdown from the first chunk, revealed at the library's typewriter
 * pace. A one-line reply shrink-wraps like a chat bubble; anything with a line break — a heading, a
 * list, several paragraphs — takes the full width, because the markdown library sizes list text with
 * a zero flex basis and paragraphs at 100%, which collapsed a shrink-wrapped bubble to its widest
 * heading while the lines were measured wide. An empty part draws nothing: the typing bubble stands
 * for the wait.
 */
const AssistantText: TextMessagePartComponent = (part) => {
  const { colors, isDark } = useTheme();
  const markdown = useMemo(() => markdownStyles(colors), [colors]);
  const { text } = useSmooth(part, SMOOTH);

  if (text === '') return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(ENTER_MS)}
      style={[styles.bubble, hasLineBreak(text) && styles.wide, { backgroundColor: colors.muted }]}
    >
      <Markdown style={markdown} colorScheme={isDark ? 'dark' : 'light'}>
        {text}
      </Markdown>
    </Animated.View>
  );
};

function TypingDot({ delay }: { readonly delay: number }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(DOT_MIN_OPACITY);

  useEffect(() => {
    const pulse = withSequence(
      withTiming(1, { duration: DOT_FADE_MS }),
      withTiming(DOT_MIN_OPACITY, { duration: DOT_FADE_MS }),
    );
    opacity.set(withDelay(delay, withRepeat(pulse, -1)));
    return () => cancelAnimation(opacity);
  }, [delay, opacity]);

  const pulsing = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View style={[styles.dot, pulsing, { backgroundColor: colors.mutedForeground }]} />
  );
}

/** The server's status for the wait ("Reading your workouts"), carried in the message's metadata while it streams. */
function readStatus(custom: Record<string, unknown>): string | null {
  const { status } = custom;
  return typeof status === 'string' && status !== '' ? status : null;
}

/**
 * Three pulsing dots, and beside them what the coach is doing when the server says. Shown under
 * whatever has streamed so far, so a long block write stays legible after the read has landed.
 */
function TypingIndicator() {
  const { colors } = useTheme();
  const isRunning = useAuiState((s) => s.message.status?.type === 'running');
  // A workout just announced by the server: its review is being written, and this is the wait for it.
  const reviewing = useAuiState((s) => s.message.isLast && s.message.metadata.custom.kind === 'logged');
  const status = useAuiState((s) => readStatus(s.message.metadata.custom)) ?? (reviewing ? REVIEWING : null);
  if (!isRunning && !reviewing) return null;

  return (
    <Animated.View entering={FadeInDown.duration(ENTER_MS)} style={[styles.bubble, styles.typing, { backgroundColor: colors.muted }]}>
      <TypingDot delay={0} />
      <TypingDot delay={DOT_STAGGER_MS} />
      <TypingDot delay={DOT_STAGGER_MS * 2} />
      {status !== null && (
        <Text style={[styles.status, { color: colors.mutedForeground }]} numberOfLines={1}>
          {status + ELLIPSIS}
        </Text>
      )}
    </Animated.View>
  );
}

/** Right, in Hevy blue — the user half of the iOS Messages pairing. Plain text. */
function UserMessage() {
  const { colors } = useTheme();
  return (
    <MessagePrimitive.Root style={styles.userContainer}>
      <Animated.View
        entering={FadeInDown.duration(ENTER_MS)}
        style={[styles.bubble, { backgroundColor: colors.accent }]}
      >
        <MessagePrimitive.Parts components={{ Text: UserText }} />
      </Animated.View>
    </MessagePrimitive.Root>
  );
}

/** Left, in Hevy's grey fill. Session cards, pills and the number field sit under the bubble, not in it. */
/** Left, in Hevy's grey fill: a bubble per text part, the typing bubble while the coach works, then cards and pills. */
function AssistantMessage() {
  const { colors } = useTheme();
  return (
    <MessagePrimitive.Root style={styles.assistantContainer}>
      <ReviewCaption />
      <MessagePrimitive.Parts components={{ Text: AssistantText }} />
      <TypingIndicator />
      <ErrorPrimitive.Root
        style={[styles.error, { backgroundColor: colors.destructiveSurface, borderColor: colors.destructive }]}
      >
        <ErrorPrimitive.Message style={[styles.errorText, { color: colors.destructive }]} />
      </ErrorPrimitive.Root>
      <PlanCards />
      <ChoicePills />
    </MessagePrimitive.Root>
  );
}

export function MessageBubble() {
  const role = useAuiState((s) => s.message.role);
  if (role === 'user') return <UserMessage />;
  return <AssistantMessage />;
}

const styles = StyleSheet.create({
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
    gap: 8,
  },
  wide: {
    alignSelf: 'stretch',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.bubble,
  },
  userText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  status: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
    marginLeft: 6,
  },
  error: {
    marginTop: 8,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
