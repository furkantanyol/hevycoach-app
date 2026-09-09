import type { ExerciseHistoryEntry } from '@furkantanyol/hevy-client';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { oneRepMaxTrend, type SessionEstimate } from './e1rm';
import { OneRepMaxChart } from './e1rm-chart';
import { loadFigure } from './figures';
import { formatDate, joinNote } from './format';
import { toSessions, type LoggedSession } from './history';
import { collectNotes, findExerciseTitle, type LiftNote } from './notes';

import { Rule, Settle } from '@/components/motion';
import { RuledHeader, RuledRow } from '@/components/ruled-row';
import { Stamp } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
import { CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { useExerciseHistory, useRecentWorkouts, useRoutines } from '@/features/hevy/queries';
import { QueryStatus } from '@/features/hevy/query-status';

type LiftParams = {
  readonly templateId: string;
  readonly title?: string;
};

type Row =
  | { readonly kind: 'session'; readonly key: string; readonly session: LoggedSession }
  | {
      readonly kind: 'set';
      readonly key: string;
      readonly entry: ExerciseHistoryEntry;
      readonly number: number;
    };

const FALLBACK_TITLE = 'Lift';
const NOTHING_LOGGED = 'No logged sets for this exercise yet.';
const HISTORY_COLUMNS = ['Load kg', 'Reps'];
const NORMAL_SET = 'normal';

function toRows(sessions: readonly LoggedSession[]): Row[] {
  return sessions.flatMap<Row>((session) => [
    { kind: 'session', key: `session-${session.workoutId}`, session },
    ...session.sets.map((entry, index) => ({
      kind: 'set' as const,
      key: `set-${session.workoutId}-${index}`,
      entry,
      number: index + 1,
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
    <ThemedView style={Screen.container}>
      <Stack.Screen options={{ title: knownTitle ?? FALLBACK_TITLE }} />
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={Screen.listContent}
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
            <SessionHead session={item.session} />
          ) : (
            <SetRow entry={item.entry} number={item.number} />
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
    <Settle visible={visible}>
      {offline}
      <View style={styles.section}>
        <Stamp>Estimated 1RM</Stamp>
        <Rule weight="ink" />
        <View style={styles.chart}>
          <OneRepMaxChart points={trend} />
        </View>
        <ThemedText type="small" themeColor="inkSecondary">
          An estimate from your best working set in each session, by the Epley formula. It is not a
          tested max and it is not a target.
        </ThemedText>
      </View>
      {notes.length > 0 ? (
        <View style={styles.section}>
          <Stamp>Your notes</Stamp>
          <Rule weight="ink" />
          {notes.map((note) => (
            <View key={`${note.source}-${note.text}`} style={styles.note}>
              <ThemedText>{note.text}</ThemedText>
              <ThemedText type="small" themeColor="inkSecondary">
                {note.source}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.section}>
        <RuledHeader label="History" columns={HISTORY_COLUMNS} />
      </View>
    </Settle>
  );
}

/** The date a run of sets was logged on, stamped over them the way a sheet dates a block. */
function SessionHead({ session }: { session: LoggedSession }) {
  return (
    <View style={styles.sessionHead}>
      <Stamp>{`${formatDate(session.startTime)} · ${session.title}`}</Stamp>
    </View>
  );
}

function SetRow({ entry, number }: { entry: ExerciseHistoryEntry; number: number }) {
  return (
    <RuledRow
      label={`Set ${number}`}
      note={joinNote([
        entry.set_type === NORMAL_SET ? null : entry.set_type,
        entry.rpe === null ? null : `RPE ${entry.rpe}`,
        entry.duration_seconds === null ? null : `${entry.duration_seconds}s`,
        entry.distance_meters === null ? null : `${entry.distance_meters} m`,
      ])}
      figures={[loadFigure([entry.weight_kg]), entry.reps === null ? null : String(entry.reps)]}
    />
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  chart: {
    paddingTop: Spacing.three,
  },
  note: {
    gap: Spacing.half,
    paddingTop: Spacing.two,
  },
  sessionHead: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.one,
  },
});
