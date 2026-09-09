import type { Routine, RoutineExercise } from '@furkantanyol/hevy-client';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import { RuledHeader } from '@/components/ruled-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
import { useRoutines } from '@/features/hevy/queries';
import { QueryStatus } from '@/features/hevy/query-status';
import { loadFigure, targetRepsFigure } from '@/features/lifts/figures';
import { LiftLink } from '@/features/lifts/lift-link';

const LIFT_DETAIL_PATHNAME = '/program/lift/[templateId]' as const;
const NO_ROUTINES = 'No routines saved in Hevy yet. Build one in Hevy and it shows up here.';
const COLUMNS = ['Target kg', 'Reps'];

type Row =
  | { readonly kind: 'session'; readonly key: string; readonly routine: Routine }
  | { readonly kind: 'exercise'; readonly key: string; readonly exercise: RoutineExercise };

/**
 * The block, as it exists today: the user's own Hevy routines, each a session of exercises with
 * the target sets Hevy itself stores. A generated block will take this shape, which is why the
 * list is sessions containing exercises rather than a flat exercise list.
 */
function toRows(routines: readonly Routine[]): Row[] {
  return routines.flatMap<Row>((routine) => [
    { kind: 'session', key: `routine-${routine.id}`, routine },
    ...routine.exercises.map((exercise) => ({
      kind: 'exercise' as const,
      key: `exercise-${routine.id}-${exercise.index}-${exercise.exercise_template_id}`,
      exercise,
    })),
  ]);
}

/**
 * The whole block on one sheet: every session its own ruled table, printed one under the next,
 * with the same columns and the same alignment down the page. Nothing here is derived — the
 * targets are the ones the routine already stores in Hevy.
 */
export default function ProgramScreen() {
  const routines = useRoutines();
  const rows = toRows(routines.data ?? []);

  // The header renders with or without rows, so it is the only place the query's state is said —
  // and it says it about the rows that are actually there, not about rows it assumes.
  return (
    <ThemedView style={Screen.container}>
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={Screen.listContent}
        data={rows}
        getItemType={(row) => row.kind}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={
          <QueryStatus query={routines} hasRows={rows.length > 0} whenEmpty={NO_ROUTINES} />
        }
        renderItem={({ item }) =>
          item.kind === 'session' ? (
            <SessionHead routine={item.routine} />
          ) : (
            <LiftLink
              pathname={LIFT_DETAIL_PATHNAME}
              templateId={item.exercise.exercise_template_id}
              title={item.exercise.title}
              figures={[
                loadFigure(item.exercise.sets.map((set) => set.weight_kg)),
                targetRepsFigure(item.exercise.sets),
              ]}
              note={item.exercise.notes.trim().length > 0 ? item.exercise.notes.trim() : null}
            />
          )
        }
      />
    </ThemedView>
  );
}

/** A session heading and the head of its table, which are one thing on a printed sheet. */
function SessionHead({ routine }: { routine: Routine }) {
  const exercises = routine.exercises.length;

  return (
    <View style={styles.session}>
      <ThemedText type="subtitle">
        {routine.title}
      </ThemedText>
      <ThemedText type="small" themeColor="inkSecondary" style={styles.count}>
        {exercises === 1 ? '1 exercise' : `${exercises} exercises`}
      </ThemedText>
      <RuledHeader label="Exercise" columns={COLUMNS} />
    </View>
  );
}

const styles = StyleSheet.create({
  session: {
    paddingTop: Spacing.five,
  },
  count: {
    paddingBottom: Spacing.three,
  },
});
