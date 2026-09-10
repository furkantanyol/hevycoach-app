import { ThreadPrimitive } from '@assistant-ui/react-native';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from './composer';
import { MessageBubble } from './message';
import { Spacing } from './theme';

const COMPOSER_BOTTOM_GAP = 8;

/**
 * `MessagesFlatList` feeds `FlatList` the thread oldest-first and maps each row
 * back by index, so `inverted` would render the conversation backwards. Newest
 * at the bottom comes instead from its own scroll handling (autoScroll and
 * scrollToBottomOnInitialize, both default true) plus a content container that
 * grows to the viewport and stacks to the end, which keeps a short thread
 * sitting on the composer the way iOS Messages does. An empty thread draws
 * nothing: the server posts the opener on the first load.
 */
export function Thread() {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThreadPrimitive.MessagesFlatList
        style={styles.flex}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      >
        {() => <MessageBubble />}
      </ThreadPrimitive.MessagesFlatList>
      <View style={{ paddingBottom: insets.bottom + COMPOSER_BOTTOM_GAP }}>
        <Composer />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
});
