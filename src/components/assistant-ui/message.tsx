import {
  ErrorPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartComponent,
} from '@assistant-ui/react-native';
import Markdown, { type MarkdownStyleMap } from '@ronradtke/react-native-markdown-display';
import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { ChoicePills } from './choices';
import { ReviewCaption } from './coach-metadata';
import { BodyweightInput } from './inline-input';
import { Radius, useTheme, type Palette } from './theme';

const DOT_FADE_MS = 400;
/** Between paragraphs, lists and headings — the 8pt rhythm, not the library's 10. */
const BLOCK_GAP = 8;
const LIST_GAP = 4;
/** The coach writes short headings, so they sit one step above the body, not four. */
const HEADING_TEXT = { fontSize: 17, lineHeight: 24, fontWeight: '700' } as const;
const ASSISTANT_TEXT = { fontSize: 16, lineHeight: 25, letterSpacing: -0.2 } as const;

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
 * Markdown once the part is complete, plain text while it streams: half a bold
 * marker or an unclosed bullet would otherwise reflow the bubble on every chunk.
 */
const AssistantText: TextMessagePartComponent = ({ text, status }) => {
  const { colors, isDark } = useTheme();
  const markdown = useMemo(() => markdownStyles(colors), [colors]);

  if (status.type !== 'complete') {
    return <Text style={[styles.assistantText, { color: colors.foreground }]}>{text}</Text>;
  }
  return (
    <Markdown style={markdown} colorScheme={isDark ? 'dark' : 'light'}>
      {text}
    </Markdown>
  );
};

function TypingDot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  // useState, not useRef: this repo's react-hooks/refs rule forbids reading
  // `.current` during render, and the value must survive re-renders.
  const [opacity] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: DOT_FADE_MS,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: DOT_FADE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, delay]);

  return (
    <Animated.View style={[styles.dot, { opacity, backgroundColor: colors.mutedForeground }]} />
  );
}

function TypingIndicator() {
  const isRunning = useAuiState((s) => s.message.status?.type === 'running');
  if (!isRunning) return null;

  return (
    <View style={styles.typing}>
      <TypingDot delay={0} />
      <TypingDot delay={160} />
      <TypingDot delay={320} />
    </View>
  );
}

/** Right, in Hevy blue — the user half of the iOS Messages pairing. Plain text. */
function UserMessage() {
  const { colors } = useTheme();
  return (
    <MessagePrimitive.Root style={styles.userContainer}>
      <View style={[styles.bubble, { backgroundColor: colors.accent }]}>
        <MessagePrimitive.Parts components={{ Text: UserText }} />
      </View>
    </MessagePrimitive.Root>
  );
}

/** Left, in the light-grey pill. Pills and the number field sit under the bubble, not in it. */
function AssistantMessage() {
  const { colors } = useTheme();
  return (
    <MessagePrimitive.Root style={styles.assistantContainer}>
      <ReviewCaption />
      <View style={[styles.bubble, { backgroundColor: colors.muted }]}>
        <MessagePrimitive.Parts components={{ Text: AssistantText, Empty: TypingIndicator }} />
        <ErrorPrimitive.Root
          style={[
            styles.error,
            { backgroundColor: colors.destructiveSurface, borderColor: colors.destructive },
          ]}
        >
          <ErrorPrimitive.Message style={[styles.errorText, { color: colors.destructive }]} />
        </ErrorPrimitive.Root>
      </View>
      <ChoicePills />
      <BodyweightInput />
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
  assistantText: ASSISTANT_TEXT,
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
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
