/**
 * The block the coach wrote, read from GET /block on every focus and foreground.
 * The large title is the block's own name, the next session is pinned open, and
 * the sessions Hevy has already seen carry their verdict. Nothing is stored: a
 * pull re-reads the server, which is the only place the block lives.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { Spacing, useTheme } from '../../components/assistant-ui/theme';
import { BlockSessions } from '../../components/plan/block-sessions';
import { EmptyBlock } from '../../components/plan/empty-block';
import { blockCaption } from '../../components/plan/format';
import { InlineError, Screen, ScreenTitle } from '../../components/screen';
import { useServer, type ServerState } from '../../lib/server';
import type { BlockResponse } from '../../lib/types';

const PLAN_TITLE = 'Plan';

/**
 * `useServer` raises `loading` for the focus and foreground reads as well, and a
 * spinner that drops in every time the tab is opened is noise. Only a real pull
 * turns the control, and the read that pull started ends it: the pull and the
 * load it starts are set in the same event, so `loading` is already true by the
 * next render and only its fall back to false clears the control (React's
 * "adjusting state during render", not an effect).
 */
function usePullToRefresh(state: ServerState<BlockResponse>) {
  const { loading, refresh } = state;
  const [pulled, setPulled] = useState(false);
  if (pulled && !loading) setPulled(false);

  const onRefresh = useCallback(() => {
    setPulled(true);
    refresh();
  }, [refresh]);

  return { refreshing: pulled, onRefresh };
}

function PlanBody({ state }: { readonly state: ServerState<BlockResponse> }) {
  const { colors } = useTheme();
  const { data, loading, error } = state;

  if (data?.block) {
    return (
      <BlockSessions
        block={data.block}
        nextSessionIndex={data.nextSessionIndex}
        completions={data.completions}
      />
    );
  }
  if (!data && loading) {
    return <ActivityIndicator style={styles.loading} color={colors.mutedForeground} />;
  }
  if (!data && error) return <InlineError>{error}</InlineError>;
  return <EmptyBlock />;
}

export default function PlanScreen() {
  const { colors } = useTheme();
  const state = useServer<BlockResponse>('/block');
  const { refreshing, onRefresh } = usePullToRefresh(state);
  const block = state.data?.block ?? null;

  return (
    <Screen>
      <ScreenTitle>{block ? block.name : PLAN_TITLE}</ScreenTitle>
      {block ? (
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          {blockCaption(block)}
        </Text>
      ) : null}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }
      >
        {block && state.error ? <InlineError>{state.error}</InlineError> : null}
        <PlanBody state={state} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 14,
    lineHeight: 19,
    paddingBottom: 4,
    paddingHorizontal: Spacing.gutter,
  },
  content: {
    paddingBottom: 32,
    paddingHorizontal: Spacing.gutter,
    paddingTop: 12,
  },
  loading: {
    paddingVertical: 32,
  },
});
