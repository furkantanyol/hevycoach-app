import type { Workout } from '@furkantanyol/hevy-client';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import { Settle } from '@/components/motion';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
import { CoachSection } from '@/features/coach/coach-section';
import { CONTEXT_WINDOW_DAYS, workoutsWithin } from '@/features/coach/weekly-context';
import { useExerciseTemplates, useRecentWorkouts } from '@/features/hevy/queries';
import { QueryStatus } from '@/features/hevy/query-status';
import { describeLoggedSet, formatDate } from '@/features/lifts/format';
import { LiftLink } from '@/features/lifts/lift-link';
import {
  formatMuscleGroup,
  workingSetsByMuscleGroup,
  type MuscleGroupSetCount,
} from '@/features/review/muscle-groups';

const LIFT_DETAIL_PATHNAME = '/review/lift/[templateId]' as const;
const NOTHING_LOGGED = `Nothing logged in Hevy in the last ${CONTEXT_WINDOW_DAYS} days.`;

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

type Row =
  | { readonly kind: 'heading'; readonly key: string; readonly text: string }
  | { readonly kind: 'group'; readonly key: string; readonly group: MuscleGroupSetCount }
  | { readonly kind: 'session'; readonly key: string; readonly workout: Workout }
  | {
      readonly kind: 'exercise';
      readonly key: string;
      readonly templateId: string;
      readonly title: string;
      readonly detail: string;
    };

function toRows(sessions: readonly Workout[], groups: readonly MuscleGroupSetCount[]): Row[] {
  const latest = sessions.at(0);
  if (latest === undefined) {
    return [];
  }

  return [
    { kind: 'heading' as const, key: 'heading-volume', text: 'Working sets by muscle group' },
    ...groups.flatMap<Row>((group) => [
      { kind: 'group' as const, key: `group-${group.muscleGroup}`, group },
      ...group.exercises.map((exercise) => ({
        kind: 'exercise' as const,
        key: `group-${group.muscleGroup}-${exercise.templateId}`,
        templateId: exercise.templateId,
        title: exercise.title,
        detail: `${exercise.workingSets} working sets`,
      })),
    ]),
    { kind: 'heading' as const, key: 'heading-latest', text: 'Most recent session' },
    { kind: 'session' as const, key: `session-${latest.id}`, workout: latest },
    ...latest.exercises.map<Row>((exercise) => ({
      kind: 'exercise' as const,
      key: `latest-${exercise.index}-${exercise.exercise_template_id}`,
      templateId: exercise.exercise_template_id,
      title: exercise.title,
      detail: exercise.sets.map(describeLoggedSet).join('   '),
    })),
  ];
}

/**
 * The week as it was actually trained. Every count is of the user's own logged sets, and every one
 * of them opens the history behind it — nothing is measured against a weekly target, because the
 * rules engine owns those and its spec has not landed.
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
          <ReviewHeader
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

type ReviewHeaderProps = {
  readonly sessionCount: number;
  readonly offline: React.ReactNode;
  readonly library: React.ReactNode;
};

function ReviewHeader({ sessionCount, offline, library }: ReviewHeaderProps) {
  return (
    <Settle visible={sessionCount > 0} style={styles.header}>
      {offline}
      <ThemedText type="subtitle">
        {`${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`}
      </ThemedText>
      <ThemedText type="small" themeColor="inkSecondary">
        {`In the last ${CONTEXT_WINDOW_DAYS} days.`}
      </ThemedText>
      {library}
    </Settle>
  );
}

function ReviewRow({ row }: { row: Row }) {
  if (row.kind === 'heading') {
    return (
      <View style={styles.headingRow}>
        <ThemedText>{row.text}</ThemedText>
      </View>
    );
  }

  if (row.kind === 'group') {
    return (
      <View style={styles.groupRow}>
        <ThemedText>{formatMuscleGroup(row.group.muscleGroup)}</ThemedText>
        <ThemedText themeColor="inkSecondary">{`${row.group.workingSets} sets`}</ThemedText>
      </View>
    );
  }

  if (row.kind === 'session') {
    return (
      <View style={styles.groupRow}>
        <ThemedText>{row.workout.title}</ThemedText>
        <ThemedText type="small" themeColor="inkSecondary">
          {formatDate(row.workout.start_time)}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.indented}>
      <LiftLink
        pathname={LIFT_DETAIL_PATHNAME}
        templateId={row.templateId}
        title={row.title}
        detail={row.detail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.half,
    paddingBottom: Spacing.three,
  },
  headingRow: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: Spacing.three,
  },
  indented: {
    paddingLeft: Spacing.three,
  },
});
