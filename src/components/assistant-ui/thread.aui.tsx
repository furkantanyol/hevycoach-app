import { AuiIf, ThreadPrimitive } from '@assistant-ui/react-native';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from './composer';
import { MessageBubble } from './message';
import { Spacing, useTheme } from './theme';

const COMPOSER_BOTTOM_GAP = 8;
const SCREEN_TITLE = 'Coach';
const EMPTY_LINE = 'Send a message to start.';

function ScreenTitle() {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, { color: colors.foreground }]}
      numberOfLines={1}
    >
      {SCREEN_TITLE}
    </Text>
  );
}

function EmptyState() {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyLine, { color: colors.mutedForeground }]}>{EMPTY_LINE}</Text>
    </View>
  );
}

/**
 * `MessagesFlatList` feeds `FlatList` the thread oldest-first and maps each row
 * back by index, so `inverted` would render the conversation backwards. Newest
 * at the bottom comes instead from its own scroll handling (autoScroll and
 * scrollToBottomOnInitialize, both default true) plus a content container that
 * grows to the viewport and stacks to the end, which keeps a short thread
 * sitting on the composer the way iOS Messages does.
 */
function ChatMessages() {
  return (
    <>
      <AuiIf condition={(s) => s.thread.isEmpty}>
        <EmptyState />
      </AuiIf>
      <AuiIf condition={(s) => !s.thread.isEmpty}>
        <ThreadPrimitive.MessagesFlatList
          style={styles.flex}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        >
          {() => <MessageBubble />}
        </ThreadPrimitive.MessagesFlatList>
      </AuiIf>
    </>
  );
}

export function Thread() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenTitle />
        <View style={styles.flex}>
          <ChatMessages />
        </View>
        <View style={{ paddingBottom: insets.bottom + COMPOSER_BOTTOM_GAP }}>
          <Composer />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    paddingHorizontal: Spacing.gutter,
    paddingTop: 8,
    paddingBottom: 4,
  },
  messageList: {
    width: '100%',
    maxWidth: Spacing.threadMaxWidth,
    marginHorizontal: 'auto',
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingVertical: 16,
    paddingHorizontal: Spacing.gutter,
    gap: 18,
  },
  empty: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.gutter,
    paddingBottom: 16,
  },
  emptyLine: {
    fontSize: 16,
    lineHeight: 22,
  },
});
