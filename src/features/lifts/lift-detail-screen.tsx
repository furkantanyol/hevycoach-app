import type { ExerciseHistoryEntry } from '@furkantanyol/hevy-client';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { oneRepMaxTrend, type SessionEstimate } from './e1rm';
import { OneRepMaxChart } from './e1rm-chart';
import { describeLoggedSet, formatDate } from './format';
import { toSessions, type LoggedSession } from './history';
import { collectNotes, findExerciseTitle, type LiftNote } from './notes';

import { Appear } from '@/components/appear';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { useExerciseHistory, useRecentWorkouts, useRoutines } from '@/features/hevy/queries';
import { QueryStatus } from '@/features/hevy/query-status';

type LiftParams = {
  readonly templateId: string;
  readonly title?: string;
};

type Row =
  | { readonly kind: 'session'; readonly key: string; readonly session: LoggedSession }
  | { readonly kind: 'set'; readonly key: string; readonly entry: ExerciseHistoryEntry };

const FALLBACK_TITLE = 'Lift';
const NOTHING_LOGGED = 'No logged sets for this exercise yet.';

function toRows(sessions: readonly LoggedSession[]): Row[] {
  return sessions.flatMap<Row>((session) => [
    { kind: 'session', key: `session-${session.workoutId}`, session },
    ...session.sets.map((entry, index) => ({
      kind: 'set' as const,
      key: `set-${session.workoutId}-${index}`,
      entry,
    })),
  ]);
}

/**
 * One exercise, as the user has actually logged it: the whole history in one unpaginated read, the
 * estimated 1RM trend over it, and their own notes. Pushed from Program and from Review, so it is a
 * detail screen in both stacks and keeps an inline title.
 */
export default function LiftDetailScreen() {
  const { templateId, title } = useLocalSearchParams<LiftParams>();
  const history = useExerciseHistory(templateId);
  const routines = useRoutines();
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS);

  const rows = toRows(toSessions(history.data ?? []));
  const notes = collectNotes(templateId, routines.data ?? [], workouts.data ?? []);
  const knownTitle = title ?? findExerciseTitle(templateId, routines.data ?? [], workouts.data ?? []);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: knownTitle ?? FALLBACK_TITLE }} />
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={rows}
        getItemType={(row) => row.kind}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={
          <LiftHeader
            visible={rows.length > 0}
            trend={oneRepMaxTrend(history.data ?? [])}
            notes={notes}
            offline={<QueryStatus query={history} hasRows whenEmpty={NOTHING_LOGGED} />}
          />
        }
        ListEmptyComponent={
          <QueryStatus query={history} hasRows={false} whenEmpty={NOTHING_LOGGED} />
        }
        renderItem={({ item }) =>
          item.kind === 'session' ? (
            <SessionHeaderRow session={item.session} />
          ) : (
            <SetRow entry={item.entry} />
          )
        }
      />
    </ThemedView>
  );
}

type LiftHeaderProps = {
  readonly visible: boolean;
  readonly trend: readonly SessionEstimate[];
  readonly notes: readonly LiftNote[];
  readonly offline: React.ReactNode;
};

function LiftHeader({ visible, trend, notes, offline }: LiftHeaderProps) {
  return (
    <Appear visible={visible} style={styles.header}>
      {offline}
      <View style={styles.section}>
        <ThemedText>Estimated 1RM</ThemedText>
        <OneRepMaxChart points={trend} />
        <ThemedText type="small" themeColor="textSecondary">
          An estimate from your best working set in each session, by the Epley formula. It is not a
          tested max and it is not a target.
        </ThemedText>
      </View>
      {notes.length > 0 ? (
        <View style={styles.section}>
          <ThemedText>Your notes</ThemedText>
          {notes.map((note) => (
            <View key={`${note.source}-${note.text}`} style={styles.note}>
              <ThemedText type="small" themeColor="textSecondary">
                {note.source}
              </ThemedText>
              <ThemedText>{note.text}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      <ThemedText>History</ThemedText>
    </Appear>
  );
}

function SessionHeaderRow({ session }: { session: LoggedSession }) {
  return (
    <View style={styles.sessionRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {`${formatDate(session.startTime)} · ${session.title}`}
      </ThemedText>
    </View>
  );
}

function SetRow({ entry }: { entry: ExerciseHistoryEntry }) {
  return (
    <View style={styles.setRow}>
      <ThemedText>{describeLoggedSet(entry)}</ThemedText>
    </View>
  );
}

const MIN_ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
  },
  header: {
    gap: Spacing.four,
    paddingBottom: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  note: {
    gap: Spacing.half,
  },
  sessionRow: {
    minHeight: MIN_ROW_HEIGHT,
    justifyContent: 'flex-end',
    paddingTop: Spacing.three,
  },
  setRow: {
    minHeight: MIN_ROW_HEIGHT,
    justifyContent: 'center',
  },
});
