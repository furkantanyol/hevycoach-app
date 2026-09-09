import type { RoutineExercise, WorkoutExercise } from '@furkantanyol/hevy-client';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Settle } from '@/components/motion';
import { RuledHeader, RuledRow } from '@/components/ruled-row';
import { Stamp, StampedField, StampedHead } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekStrip } from '@/components/week-strip';
import { Screen, Spacing } from '@/constants/theme';
import { CONTEXT_WINDOW_DAYS } from '@/features/coach/weekly-context';
import { useExerciseHistory, useRecentWorkouts, useRoutines } from '@/features/hevy/queries';
import { describeQueryState, queryState } from '@/features/hevy/query-state';
import { StatusLine } from '@/features/hevy/query-status';
import { loadFigure, repsFigure, targetRepsFigure } from '@/features/lifts/figures';
import { formatDate, joinNote } from '@/features/lifts/format';
import { toSessions } from '@/features/lifts/history';
import { isWorkingEntry, isWorkingSet } from '@/features/lifts/sets';
import { daySession, type DaySession } from '@/features/today/day-session';
import { pickNextRoutine } from '@/features/today/next-routine';
import { buildWeek, describeWeek } from '@/features/today/week';

const NO_ROUTINES = 'No routines saved in Hevy yet. Build one in Hevy and it shows up here.';
const NEVER_LOGGED = 'never logged in Hevy';
const PLANNED_COLUMNS = ['Target kg', 'Last kg'];
const LOGGED_COLUMNS = ['Load kg', 'Reps'];

/**
 * The sheet, read one-handed between sets: the week as a chart with today under the marker, and
 * the day being read as a ruled table below it. Dragging along the chart re-rules the table to
 * that day, which is the only navigation this screen has; the marker stays on today throughout.
 *
 * Every figure on it is Hevy's own — a routine's stored target, or a set the lifter logged. The
 * rules engine that will compute a target does not exist yet, and a made-up one would be worse
 * than none.
 */
export default function TodayScreen() {
  const routines = useRoutines();
  const workouts = useRecentWorkouts(CONTEXT_WINDOW_DAYS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const next = pickNextRoutine(routines.data ?? [], workouts.data ?? []);
  const plannedSets = (next?.routine.exercises ?? []).reduce(
    (total, exercise) => total + exercise.sets.length,
    0
  );
  const week = buildWeek(workouts.data ?? [], plannedSets);
  const selected = week.find((day) => day.key === selectedKey) ?? week[week.length - 1];
  const session = daySession(selected, next);

  // Routines decide what is on screen, so they speak first; the workouts read only speaks when it
  // has something the routines read does not, because a failed one picks the wrong session
  // silently. Its own emptiness says nothing: a new user has no history, and that is not news.
  const status =
    describeQueryState(queryState(routines, next !== null), NO_ROUTINES) ??
    describeQueryState(queryState(workouts, (workouts.data?.length ?? 0) > 0), null);

  return (
    <ThemedView style={Screen.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.sheet}>
        <StampedHead>
          <StampedField stamp="Block" value={describeBlock(routines.data?.length ?? 0)} />
          <StampedField stamp="Week" value={describeWeek(week)} trailing />
        </StampedHead>
        <Stamp style={styles.legend}>Sets per day</Stamp>

        <WeekStrip days={week} selectedKey={selected.key} onSelect={setSelectedKey} />

        <Settle visible={!routines.isPending} style={styles.session}>
          <ThemedText type="subtitle">
            {session.title}
          </ThemedText>
          <ThemedText type="small" themeColor="inkSecondary">
            {session.note}
          </ThemedText>
        </Settle>
        <StatusLine>{status}</StatusLine>

        <SessionTable session={session} lead={selected.isToday} />
      </ScrollView>
    </ThemedView>
  );
}

function describeBlock(sessions: number): string {
  if (sessions === 0) {
    return '—';
  }
  return sessions === 1 ? '1 session' : `${sessions} sessions`;
}

/** The table under the chart. Its columns change with the day, and its stamps say so. */
function SessionTable({ session, lead }: { session: DaySession; lead: boolean }) {
  if (session.kind === 'empty') {
    return null;
  }

  const columns = session.kind === 'planned' ? PLANNED_COLUMNS : LOGGED_COLUMNS;

  return (
    <View>
      <RuledHeader label="Exercise" columns={columns} />
      {session.kind === 'planned'
        ? session.exercises.map((exercise, index) => (
            <PlannedRow
              key={`${exercise.index}-${exercise.exercise_template_id}`}
              exercise={exercise}
              lead={lead && index === 0}
            />
          ))
        : session.exercises.map((exercise, index) => (
            <LoggedRow
              key={`${exercise.index}-${exercise.exercise_template_id}`}
              exercise={exercise}
              lead={lead && index === 0}
            />
          ))}
    </View>
  );
}

/**
 * One exercise of the session to come: the routine's own target, and the load the lifter last put
 * on the bar for it. The two are never reconciled into a third number.
 */
function PlannedRow({ exercise, lead }: { exercise: RoutineExercise; lead: boolean }) {
  const history = useExerciseHistory(exercise.exercise_template_id);
  const previous = toSessions(history.data ?? []).at(0);
  const working = previous?.sets.filter(isWorkingEntry) ?? [];
  const reps = targetRepsFigure(exercise.sets);

  return (
    <RuledRow
      lead={lead}
      label={exercise.title}
      note={joinNote([
        reps === null ? null : `${reps} reps`,
        previous
          ? `last ${formatDate(previous.startTime)}`
          : describeQueryState(queryState(history, false), NEVER_LOGGED),
      ])}
      figures={[
        loadFigure(exercise.sets.map((set) => set.weight_kg)),
        loadFigure(working.map((set) => set.weight_kg)),
      ]}
    />
  );
}

/** One exercise of a session already logged, exactly as the lifter logged it. */
function LoggedRow({ exercise, lead }: { exercise: WorkoutExercise; lead: boolean }) {
  const working = exercise.sets.filter(isWorkingSet);

  return (
    <RuledRow
      lead={lead}
      label={exercise.title}
      note={exercise.notes.trim().length > 0 ? exercise.notes.trim() : null}
      figures={[
        loadFigure(working.map((set) => set.weight_kg)),
        repsFigure(
          working.length,
          working.map((set) => set.reps)
        ),
      ]}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  legend: {
    textAlign: 'right',
    paddingBottom: Spacing.one,
  },
  session: {
    gap: Spacing.half,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
});
