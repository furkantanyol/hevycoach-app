import { ThreadPrimitive, type ThreadMessage } from '@assistant-ui/react-native';
import { useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Composer } from './composer';
import { MessageBubble } from './message';
import { Spacing } from './theme';

const COMPOSER_BOTTOM_GAP = 8;
/** This far from the end still counts as the bottom, so the thread keeps following new messages. */
const AT_BOTTOM_SLACK = 24;

/**
 * `MessagesFlatList` feeds `FlatList` the thread oldest-first and maps each row
 * back by index, so `inverted` would render the conversation backwards. Newest
 * at the bottom comes instead from the FlatList props the primitive forwards:
 * `ThreadMessagesFlatListProps` is `Omit<FlatListProps<ThreadMessage>, 'data' |
 * 'renderItem' | 'children'>` and its ref is a `FlatList<ThreadMessage>`, so
 * `onContentSizeChange` scrolls that ref to the exact end — the content height
 * the event reports, less the viewport `onLayout` measured — every time the
 * content grows while the reader is at the bottom.
 *
 * The primitive's own `autoScroll` stays on for the keyboard and run-start
 * cases, but it cannot open a long thread on its own: it scrolls with
 * `scrollToEnd`, whose offset VirtualizedList approximates from cells it has
 * not measured yet, and once the history has landed no further content-size
 * change follows to correct the guess. Hence the exact offset here, last.
 *
 * A content container that grows to the viewport and stacks to the end keeps a
 * short thread sitting on the composer the way iOS Messages does. An empty
 * thread draws nothing: the server posts the opener on the first load.
 *
 * `keyboardShouldPersistTaps="handled"` is what lets the first tap on a pill or
 * on the number field's Send button count: without it the open keyboard eats it.
 */
export function Thread() {
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ThreadMessage>>(null);
  const viewportHeight = useRef(0);
  const atBottom = useRef(true);

  const readViewport = (event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
  };

  const trackBottom = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    atBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height <= AT_BOTTOM_SLACK;
  };

  const followEnd = (_width: number, height: number) => {
    if (!atBottom.current || viewportHeight.current === 0) return;
    list.current?.scrollToOffset({ offset: Math.max(0, height - viewportHeight.current), animated: false });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThreadPrimitive.MessagesFlatList
        ref={list}
        style={styles.flex}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={readViewport}
        onScroll={trackBottom}
        onContentSizeChange={followEnd}
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
