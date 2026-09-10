import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Thread } from '../components/assistant-ui/thread.aui';
import { coachChatAdapter, coachHistoryAdapter } from '../coach-adapter';

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
  // useLocalRuntime loads history once and the local runtime reports
  // `refetchThread: false`, so a foreground reload means a fresh runtime:
  // bump the key and let the history adapter run load() again.
  const [runtimeKey, setRuntimeKey] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRuntimeKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <CoachThread key={runtimeKey} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
