/**
 * The one screen: Hevy's large title, the week line under it, the thread. No
 * gate and no redirect — the server posts the opener, so the first launch and
 * the thousandth open the same way.
 */
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { coachChatAdapter, coachHistoryAdapter } from '../coach-adapter';
import { Thread } from '../components/assistant-ui/thread.aui';
import { Spacing, useTheme } from '../components/assistant-ui/theme';
import { useReloadCount } from '../lib/reload';
import { useServer } from '../lib/server';
import type { WeekView } from '../lib/types';

const SCREEN_TITLE = 'Coach';
/** The strip holds this height whether or not GET /week has answered. */
const STRIP_LINE_HEIGHT = 18;
/** Shown when the request failed; a request still in flight stays blank. */
const STRIP_ERROR = 'Week unavailable';

function workoutCount(workouts: number): string {
  if (workouts === 0) return 'No workouts yet this week';
  return workouts === 1 ? 'This week 1 workout' : `This week ${workouts} workouts`;
}

function weekLine(week: WeekView): string {
  const count = workoutCount(week.workoutsThisWeek);
  return week.nextSession === null ? count : `${count} · next ${week.nextSession}`;
}

/** Stale numbers beat an error message, so `data` wins whenever it is there. */
function stripLine(data: WeekView | null, error: string | null): string | null {
  if (data !== null) return weekLine(data);
  return error === null ? null : STRIP_ERROR;
}

/** Grey, one line, never taller or shorter than STRIP_LINE_HEIGHT. */
function WeekStrip() {
  const { colors } = useTheme();
  const { data, error } = useServer<WeekView>('/week');
  const line = stripLine(data, error);

  return (
    <View style={styles.strip}>
      {line === null ? null : (
        <Text style={[styles.stripText, { color: colors.mutedForeground }]} numberOfLines={1}>
          {line}
        </Text>
      )}
    </View>
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {SCREEN_TITLE}
      </Text>
      <WeekStrip />
      <CoachThread key={threadKey} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    paddingHorizontal: Spacing.gutter,
    paddingTop: 8,
  },
  strip: {
    height: STRIP_LINE_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: Spacing.gutter,
  },
  stripText: {
    fontSize: 13,
    lineHeight: STRIP_LINE_HEIGHT,
  },
});
