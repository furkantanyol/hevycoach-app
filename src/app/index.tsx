/**
 * The one screen: Hevy's large title, the card carousel over the top third,
 * the thread and its composer under it, all on the theme's plain ground the way
 * Hevy's screens sit on white. No gate and no redirect — the server posts the
 * opener, so the first launch and the thousandth open the same way.
 */
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { StyleSheet, Text } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { coachChatAdapter, coachHistoryAdapter } from '../coach-adapter';
import { Thread } from '../components/assistant-ui/thread.aui';
import { Spacing, useTheme } from '../components/assistant-ui/theme';
import { Carousel } from '../components/cards/carousel';
import { useReloadCount } from '../lib/reload';

/** Working name: "Hevy Coach" is Hevy's own coaching product, so this personal tool does not borrow it. */
const SCREEN_TITLE = 'Coach';
/** The cards are folded away once the keyboard has risen this far, and faded over the first half of it. */
const KEYBOARD_COLLAPSE_PT = 120;

/**
 * One keyboard signal, read at the screen root, moves two things in step with it: the carousel gives
 * its third of the screen to the thread, and the thread pads its bottom so the composer rides on the
 * keyboard. A `KeyboardAvoidingView` inside the thread pane cannot do the second: it measures its
 * frame relative to the pane, not the screen, and so computed no overlap at all. The safe-area view
 * already pads the home-indicator inset, which the keyboard's height includes, so that much comes off.
 */
function useKeyboardStyles() {
  const keyboard = useAnimatedKeyboard();
  const { bottom } = useSafeAreaInsets();
  const cards = useAnimatedStyle(() => {
    const height = keyboard.height.get();
    return {
      flex: interpolate(height, [0, KEYBOARD_COLLAPSE_PT], [1, 0], Extrapolation.CLAMP),
      opacity: interpolate(height, [0, KEYBOARD_COLLAPSE_PT / 2], [1, 0], Extrapolation.CLAMP),
    };
  });
  const thread = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.get() - bottom, 0) }));
  return { cards, thread };
}

/**
 * Keyed on the reload counter: a fresh key is a fresh runtime, which is the
 * only way history is read again (`useLocalRuntime` loads it once and reports
 * `refetchThread: false`). A remount aborts a streaming reply and drops an
 * unsent draft, so only a notification tap (src/lib/reload.ts) or the thread
 * watch finding a message the server added on its own, while nothing runs and
 * no draft is typed (src/lib/thread-watch.ts), asks for one — never a bare
 * return to the foreground, which happens on every Control Centre swipe,
 * permission prompt and incoming call.
 */
function CoachThread() {
  const runtime = useLocalRuntime(coachChatAdapter, {
    adapters: { history: coachHistoryAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}

export default function Index() {
  const { colors } = useTheme();
  const threadKey = useReloadCount();
  const { cards: cardsStyle, thread: threadStyle } = useKeyboardStyles();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {SCREEN_TITLE}
      </Text>
      <Animated.View style={[styles.cards, cardsStyle]}>
        <Carousel />
      </Animated.View>
      <Animated.View style={[styles.thread, threadStyle]}>
        <CoachThread key={threadKey} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // Hevy's large title: 34/700, flush under the status bar, on the gutter.
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    paddingHorizontal: Spacing.gutter,
    paddingTop: 4,
    paddingBottom: 8,
  },
  cards: {
    flex: 1,
    overflow: 'hidden',
  },
  thread: {
    flex: 2,
  },
});
