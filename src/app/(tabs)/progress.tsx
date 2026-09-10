/**
 * What the logged history says, read from the server on every focus and on a
 * pull: the three counts at the top, then one card per lift in the order the
 * server ranked them. Nothing is stored and nothing is computed here.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Spacing, useTheme } from '../../components/assistant-ui/theme';
import { LiftCard } from '../../components/progress/lift-card';
import { ProgressStats } from '../../components/progress/progress-stats';
import { InlineError, Screen, ScreenTitle } from '../../components/screen';
import { useServer } from '../../lib/server';
import type { Lift, ProgressResponse } from '../../lib/types';

const EMPTY_LINE = 'No training logged in Hevy yet.';

function renderLift({ item }: { readonly item: Lift }) {
  return <LiftCard lift={item} />;
}

function liftKey(lift: Lift): string {
  return lift.templateId;
}

/**
 * The pull spinner belongs to the gesture, not to the hook: the tab refetches
 * on every focus, and binding the spinner to that would drop it on the user
 * unasked. React's own way to follow a value without an effect is to adjust the
 * state during the render that sees it change.
 */
function usePullToRefresh(loading: boolean, refresh: () => void) {
  const [pulled, setPulled] = useState(false);
  if (pulled && !loading) setPulled(false);

  const onRefresh = useCallback(() => {
    setPulled(true);
    refresh();
  }, [refresh]);

  return { pulled, onRefresh };
}

/** Before the first answer, the spinner; after it, the one grey line. */
function NoLifts({
  data,
  loading,
}: {
  readonly data: ProgressResponse | null;
  readonly loading: boolean;
}) {
  const { colors } = useTheme();
  if (!data) {
    return loading ? (
      <ActivityIndicator style={styles.loading} color={colors.mutedForeground} />
    ) : null;
  }
  return <Text style={[styles.empty, { color: colors.mutedForeground }]}>{EMPTY_LINE}</Text>;
}

export default function ProgressScreen() {
  const { colors } = useTheme();
  const { data, error, loading, refresh } = useServer<ProgressResponse>('/progress');
  const { pulled, onRefresh } = usePullToRefresh(loading, refresh);

  return (
    <Screen>
      <ScreenTitle>Progress</ScreenTitle>
      <FlatList
        contentContainerStyle={styles.content}
        data={data?.lifts ?? []}
        keyExtractor={liftKey}
        renderItem={renderLift}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pulled}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? <InlineError>{error}</InlineError> : null}
            {data && data.workouts > 0 ? (
              <ProgressStats
                workouts={data.workouts}
                thisWeek={data.thisWeek}
                firstWorkout={data.firstWorkout}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={<NoLifts data={data} loading={loading} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 32,
    paddingHorizontal: Spacing.gutter,
    paddingTop: 12,
  },
  header: {
    gap: 12,
  },
  loading: {
    paddingVertical: 32,
  },
  empty: {
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 8,
  },
});
