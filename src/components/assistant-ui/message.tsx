import {
  ErrorPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartComponent,
} from '@assistant-ui/react-native';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { ChoicePills } from './choices';
import { ReviewCaption } from './coach-metadata';
import { Radius, useTheme } from './theme';

const DOT_FADE_MS = 400;

const UserText: TextMessagePartComponent = ({ text }) => {
  const { colors } = useTheme();
  return <Text style={[styles.userText, { color: colors.accentForeground }]}>{text}</Text>;
};

const AssistantText: TextMessagePartComponent = ({ text }) => {
  const { colors } = useTheme();
  return <Text style={[styles.assistantText, { color: colors.foreground }]}>{text}</Text>;
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

/** Right, in Hevy blue — the user half of the iOS Messages pairing. */
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

/** Left, in the light-grey pill. Choice pills sit under the bubble, not in it. */
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
  assistantText: {
    fontSize: 16,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
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
