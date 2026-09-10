/**
 * The one screen: the card carousel over the top third, the thread and its
 * composer under it. No gate and no redirect — the server posts the opener, so
 * the first launch and the thousandth open the same way. The title lives in the
 * native header (src/app/_layout.tsx), so only the bottom edge is inset here.
 */
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { coachChatAdapter, coachHistoryAdapter } from '../coach-adapter';
import { Thread } from '../components/assistant-ui/thread.aui';
import { useTheme } from '../components/assistant-ui/theme';
import { Carousel } from '../components/cards/carousel';
import { useReloadCount } from '../lib/reload';

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['bottom']}>
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
