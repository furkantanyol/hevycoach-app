import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { coachChatAdapter, coachHistoryAdapter } from '../../coach-adapter';
import { Thread } from '../../components/assistant-ui/thread.aui';

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

/**
 * useLocalRuntime loads history once and the local runtime reports
 * `refetchThread: false`, so a reload means a fresh runtime: bump the key and
 * let the history adapter run load() again. Two things ask for that — the app
 * reaching the foreground, and coming back to this tab (the Profile tab's
 * rebuild lands here with a new plan waiting on the server).
 */
function useReloadKey(): number {
  const [key, setKey] = useState(0);
  const focusedBefore = useRef(false);

  const bump = useCallback(() => setKey((current) => current + 1), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') bump();
    });
    return () => subscription.remove();
  }, [bump]);

  useFocusEffect(
    useCallback(() => {
      // The first focus is the first mount, whose history load already ran.
      if (!focusedBefore.current) {
        focusedBefore.current = true;
        return;
      }
      bump();
    }, [bump]),
  );

  return key;
}

export default function CoachScreen() {
  const reloadKey = useReloadKey();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/*
        The thread was written for a full-screen route and pads its composer by
        the bottom safe area. Under the tab bar that inset is already spent, so
        the thread sees zero and sits on the bar the way iOS Messages does.
      */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
        <CoachThread key={reloadKey} />
      </SafeAreaInsetsContext.Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
