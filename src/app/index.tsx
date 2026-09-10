/**
 * The one screen: one wash behind everything, the card carousel over the top
 * third, the thread and its composer under it. No gate and no redirect — the
 * server posts the opener, so the first launch and the thousandth open the
 * same way.
 *
 * The wash is the screen's ground, not the carousel's. It starts at the accent
 * under the status bar, thins through the cards and is the plain theme
 * background by the time the first bubbles arrive, so nothing between the
 * header and the composer draws an edge and the screen reads as one surface.
 *
 * The header is transparent (src/app/_layout.tsx) so the wash runs behind it
 * unbroken; that also means the screen is laid out from the top of the display,
 * so the header's own height is added back as padding here. The wash is
 * absolutely positioned with all four insets, which Yoga measures from the
 * border box, so that padding does not push it down.
 */
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { coachChatAdapter, coachHistoryAdapter } from '../coach-adapter';
import { Thread } from '../components/assistant-ui/thread.aui';
import { useTheme } from '../components/assistant-ui/theme';
import { Carousel } from '../components/cards/carousel';
import { wash } from '../lib/color';
import { useReloadCount } from '../lib/reload';

/** The accent at the top of the display, halved by the middle, gone by the tail. */
const WASH_TOP_ALPHA = 0.14;
const WASH_MID_ALPHA = 0.06;
/** Where the four stops sit down the screen: full, thinned, ground, ground. */
const WASH_STOPS = [0, 0.4, 0.7, 1] as const;
/**
 * The portrait height of the iOS navigation bar, added to the status bar inset
 * to clear the transparent header. `useHeaderHeight()` would be the measured
 * figure, but `@react-navigation/elements` is not a package in this install —
 * expo-router vendors it under `build/react-navigation/elements` — and reaching
 * into another package's build output for one number is not worth it.
 */
const HEADER_BAR_HEIGHT = 44;

/** Behind everything and untouchable: one ground from the top of the display down. */
function ScreenWash() {
  const { colors } = useTheme();

  return (
    <LinearGradient
      colors={[
        wash(colors.accent, WASH_TOP_ALPHA),
        wash(colors.accent, WASH_MID_ALPHA),
        colors.background,
        colors.background,
      ]}
      locations={WASH_STOPS}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

/**
 * Keyed on the reload counter: a fresh key is a fresh runtime, which is the
 * only way history is read again (`useLocalRuntime` loads it once and reports
 * `refetchThread: false`). A remount aborts a streaming reply and drops an
 * unsent draft, so only a notification tap asks for one (src/lib/reload.ts) —
 * never a return to the foreground, which happens on every Control Centre
 * swipe, permission prompt and incoming call.
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
  const insets = useSafeAreaInsets();

  const ground = {
    backgroundColor: colors.background,
    paddingTop: insets.top + HEADER_BAR_HEIGHT,
  };

  return (
    <SafeAreaView style={[styles.screen, ground]} edges={['bottom']}>
      <ScreenWash />
      <View style={styles.cards}>
        <Carousel />
      </View>
      <View style={styles.thread}>
        <CoachThread key={threadKey} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  cards: {
    flex: 1,
  },
  thread: {
    flex: 2,
  },
});
