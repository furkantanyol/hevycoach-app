import type { Workout } from '@furkantanyol/hevy-client';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import { Settle } from '@/components/motion';
import { RuledHeader, RuledRow } from '@/components/ruled-row';
import { Stamp, StampedField, StampedHead } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
import { CoachSection } from '@/features/coach/coach-section';
import { CONTEXT_WINDOW_DAYS, workoutsWithin } from '@/features/coach/weekly-context';
import { useExerciseTemplates, useRecentWorkouts } from '@/features/hevy/queries';
import { QueryStatus } from '@/features/hevy/query-status';
import { countFigure, loadFigure, repsFigure } from '@/features/lifts/figures';
import { formatDate } from '@/features/lifts/format';
import { LiftLink } from '@/features/lifts/lift-link';
import { isWorkingSet } from '@/features/lifts/sets';
import {
  formatMuscleGroup,
  workingSetsByMuscleGroup,
  type MuscleGroupSetCount,
} from '@/features/review/muscle-groups';

const LIFT_DETAIL_PATHNAME = '/review/lift/[templateId]' as const;
const NOTHING_LOGGED = `Nothing logged in Hevy in the last ${CONTEXT_WINDOW_DAYS} days.`;
const VOLUME_COLUMNS = ['Sets'];
const SESSION_COLUMNS = ['Load kg', 'Reps'];

/**
 * A quiet week should read as a quiet week rather than as an empty history, so when the window is
 * empty the last session outside it is named — the user's own log, not a judgement about it.
 */
function describeQuietWeek(workouts: readonly Workout[]): string {
  const latest = workouts.at(0);
  if (latest === undefined) {
    return NOTHING_LOGGED;
  }
  return `${NOTHING_LOGGED} Your last session was ${latest.title} on ${formatDate(latest.start_time)}.`;
}

type ExerciseRow = {
  readonly kind: 'exercise';
  readonly key: string;
  readonly templateId: string;
  readonly title: string;
  readonly figures: readonly (string | null)[];
  /** Sits under the muscle group that counted it, rather than standing on its own. */
  readonly sub: boolean;
};

type Row =
  | { readonly kind: 'volume-head'; readonly key: string }
  | { readonly kind: 'group'; readonly key: string; readonly group: MuscleGroupSetCount }
  | { readonly kind: 'session-head'; readonly key: string; readonly workout: Workout }
  | ExerciseRow;

function toRows(sessions: readonly Workout[], groups: readonly MuscleGroupSetCount[]): Row[] {
  const latest = sessions.at(0);
  if (latest === undefined) {
    return [];
  }

  return [
    { kind: 'volume-head' as const, key: 'head-volume' },
    ...groups.flatMap<Row>((group) => [
      { kind: 'group' as const, key: `group-${group.muscleGroup}`, group },
      ...group.exercises.map<ExerciseRow>((exercise) => ({
        kind: 'exercise',
        key: `group-${group.muscleGroup}-${exercise.templateId}`,
        templateId: exercise.templateId,
        title: exercise.title,
        figures: [countFigure(exercise.workingSets)],
        sub: true,
      })),
    ]),
    { kind: 'session-head' as const, key: `head-session-${latest.id}`, workout: latest },
    ...latest.exercises.map<ExerciseRow>((exercise) => {
      const working = exercise.sets.filter(isWorkingSet);
      return {
        kind: 'exercise',
        key: `latest-${exercise.index}-${exercise.exercise_template_id}`,
        templateId: exercise.exercise_template_id,
        title: exercise.title,
        figures: [
          loadFigure(working.map((set) => set.weight_kg)),
          repsFigure(
            working.length,
            working.map((set) => set.reps)
          ),
        ],
        sub: false,
      };
    }),
  ];
}

/**
 * The score sheet for the week just gone. Every count is of the user's own logged sets, and every
 * one of them opens the history behind it — nothing is measured against a weekly target, because
 * the rules engine owns those and its spec has not landed.
 */
export default function ReviewScreen() {
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS);
  const templates = useExerciseTemplates();

  const sessions = workoutsWithin(workouts.data ?? [], CONTEXT_WINDOW_DAYS).sort(
    (left, right) => Date.parse(right.start_time) - Date.parse(left.start_time)
  );
  const groups = workingSetsByMuscleGroup(sessions, templates.data ?? []);
  const rows = toRows(sessions, groups);

  return (
    <ThemedView style={Screen.container}>
      <FlashList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={Screen.listContent}
        data={rows}
        getItemType={(row) => row.kind}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={
          <ReviewHead
            sessionCount={sessions.length}
            offline={<QueryStatus query={workouts} hasRows whenEmpty={NOTHING_LOGGED} />}
            library={
              <QueryStatus
                query={templates}
                hasRows={(templates.data?.length ?? 0) > 0}
                whenEmpty="Hevy returned no exercise library, so the sets below are ungrouped."
              />
            }
          />
        }
        ListEmptyComponent={
          <QueryStatus
            query={workouts}
            hasRows={false}
            whenEmpty={describeQuietWeek(workouts.data ?? [])}
          />
        }
        ListFooterComponent={
          <CoachSection workouts={workouts.data} workoutsError={workouts.error} />
        }
        renderItem={({ item }) => <ReviewRow row={item} />}
      />
    </ThemedView>
  );
}

type ReviewHeadProps = {
  readonly sessionCount: number;
  readonly offline: React.ReactNode;
  readonly library: React.ReactNode;
};

function ReviewHead({ sessionCount, offline, library }: ReviewHeadProps) {
  return (
    <Settle visible={sessionCount > 0}>
      <StampedHead>
        <StampedField stamp="Week" value={`Last ${CONTEXT_WINDOW_DAYS} days`} />
        <StampedField
          stamp="Sessions"
          value={sessionCount === 1 ? '1 logged' : `${sessionCount} logged`}
          trailing
        />
      </StampedHead>
      {offline}
      {library}
    </Settle>
  );
}

function ReviewRow({ row }: { row: Row }) {
  if (row.kind === 'volume-head') {
    return <RuledHeader label="Working sets by muscle group" columns={VOLUME_COLUMNS} />;
  }

  if (row.kind === 'group') {
    return (
      <RuledRow
        label={formatMuscleGroup(row.group.muscleGroup)}
        figures={[countFigure(row.group.workingSets)]}
      />
    );
  }

  if (row.kind === 'session-head') {
    return (
      <View style={styles.sessionHead}>
        <Stamp>Most recent session</Stamp>
        <ThemedText type="subtitle">
          {row.workout.title}
        </ThemedText>
        <ThemedText type="small" themeColor="inkSecondary" style={styles.sessionDate}>
          {formatDate(row.workout.start_time)}
        </ThemedText>
        <RuledHeader label="Exercise" columns={SESSION_COLUMNS} />
      </View>
    );
  }

  return (
    <LiftLink
      pathname={LIFT_DETAIL_PATHNAME}
      templateId={row.templateId}
      title={row.title}
      figures={row.figures}
      sub={row.sub}
    />
  );
}

const styles = StyleSheet.create({
  sessionHead: {
    paddingTop: Spacing.six,
  },
  sessionDate: {
    paddingBottom: Spacing.three,
  },
});
