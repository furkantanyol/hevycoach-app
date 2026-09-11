import { ThreadPrimitive, type ThreadMessage, useAuiState } from '@assistant-ui/react-native';
import { useRef } from 'react';
import {
  StyleSheet,
  View,
  type FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { LayoutAnimationConfig } from 'react-native-reanimated';

import { useThreadWatch } from '../../lib/thread-watch';

import { Composer } from './composer';
import { MessageBubble } from './message';
import { Spacing } from './theme';

/**
 * Air under the composer and nothing else: the bottom safe-area inset comes
 * from the screen's `SafeAreaView` (src/app/index.tsx), so adding it again here
 * floated the composer a home indicator above the edge.
 */
const COMPOSER_BOTTOM_GAP = 8;
/** This far from the end still counts as the bottom, so the thread keeps following new messages. */
const AT_BOTTOM_SLACK = 24;
/** Below this, a released drag has no momentum and `onMomentumScrollEnd` will not follow it. */
const FLING_VELOCITY = 0.01;

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
 *
 * `LayoutAnimationConfig skipEntering` keeps the history from fading in bubble
 * by bubble on open; only messages that arrive afterwards animate. The follow
 * scroll is animated for the same reason: a new bubble slides the thread up
 * instead of snapping it, while the first landing on the history still jumps.
 *
 * Nothing in here paints a ground: the screen's plain ground (src/app/index.tsx)
 * shows through the list and the view holding it; the bubbles, the pills and the
 * composer keep Hevy's grey fill.
 */
export function Thread() {
  const list = useRef<FlatList<ThreadMessage>>(null);
  const viewportHeight = useRef(0);
  const atBottom = useRef(true);
  const landed = useRef(false);
  const hasMessages = useAuiState((s) => s.thread.messages.length > 0);
  useThreadWatch();

  const readViewport = (event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
  };

  // Only the reader's own scrolling can mean "scrolled away": a drag, and the momentum it hands off
  // to. The animated follow scroll ends in `onMomentumScrollEnd` too — mid-stream, at an offset the
  // next chunk has already outgrown — and reading that would stop the following for good.
  const dragging = useRef(false);
  const trackBottom = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    atBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height <= AT_BOTTOM_SLACK;
  };
  const startDrag = () => {
    dragging.current = true;
  };
  const endDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    trackBottom(event);
    // No fling, no momentum to wait for; a fling reports its final position in `endMomentum`.
    if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < FLING_VELOCITY) dragging.current = false;
  };
  const endMomentum = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    trackBottom(event);
  };

  // The first layout with messages on it is the landing and jumps to the newest; every growth after
  // that slides the thread up, including the first time a short thread outgrows the screen.
  const followEnd = (_width: number, height: number) => {
    if (!hasMessages || !atBottom.current || viewportHeight.current === 0) return;
    const animated = landed.current;
    landed.current = true;
    const offset = height - viewportHeight.current;
    if (offset > 0) list.current?.scrollToOffset({ offset, animated });
  };

  return (
    <View style={styles.flex}>
      <LayoutAnimationConfig skipEntering>
        <ThreadPrimitive.MessagesFlatList
          ref={list}
          style={styles.flex}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onLayout={readViewport}
          onScrollBeginDrag={startDrag}
          onScrollEndDrag={endDrag}
          onMomentumScrollEnd={endMomentum}
          onContentSizeChange={followEnd}
        >
          {() => <MessageBubble />}
        </ThreadPrimitive.MessagesFlatList>
      </LayoutAnimationConfig>
      <View style={styles.composer}>
        <Composer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  composer: {
    paddingBottom: COMPOSER_BOTTOM_GAP,
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
