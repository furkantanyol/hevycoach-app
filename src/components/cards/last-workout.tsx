/**
 * Card two: the last session Hevy logged — its name, how long ago it was, its
 * volume, and its lifts heaviest first: four on the card, every one of them
 * once the card is expanded.
 */
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CardCaption, CardHeader, RowDivider, SKELETON } from './card-text';
import { formatWeight, grouped, joinDetails } from './format';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView, Lift } from '../../lib/types';

const MAX_LIFTS = 4;
const LABEL = 'Last workout';
const EMPTY = 'No workouts yet';
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

interface LastWorkoutCardProps {
  readonly view: CardsView | null;
  readonly expanded?: boolean;
}

/** Plain words, no Intl: the caption never needs more than weeks. */
function relativeTime(at: string, now: number = Date.now()): string {
  const logged = Date.parse(at);
  if (Number.isNaN(logged)) return '';

  const minutes = Math.max(0, Math.round((now - logged) / MS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) return 'Just now';

  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;

  const days = Math.round(hours / HOURS_PER_DAY);
  if (days === 1) return 'Yesterday';
  if (days < DAYS_PER_WEEK) return `${days} days ago`;

  const weeks = Math.round(days / DAYS_PER_WEEK);
  return weeks === 1 ? 'Last week' : `${weeks} weeks ago`;
}

const totalVolume = (lifts: readonly Lift[]): number =>
  lifts.reduce((sum, lift) => sum + lift.volumeKg, 0);

/** "4 × 10 · 60 kg": sets, reps and the top weight, all a card row has room for. */
const compactLine = (lift: Lift): string =>
  `${lift.sets} × ${lift.reps} · ${formatWeight(lift.weightKg)} kg`;

/** "4 × 10 × 60 kg": the working sets in full, with the volume on its own line under it. */
const fullLine = (lift: Lift): string =>
  `${lift.sets} × ${lift.reps} × ${formatWeight(lift.weightKg)} kg`;

function LiftRow({ lift, expanded }: { readonly lift: Lift; readonly expanded: boolean }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.row, expanded && styles.rowExpanded]}>
      <Text
        style={[styles.liftTitle, { color: colors.foreground }]}
        numberOfLines={expanded ? 2 : 1}
      >
        {lift.title}
      </Text>
      <View style={styles.figures}>
        <Text
          style={[styles.liftValue, { color: expanded ? colors.foreground : colors.mutedForeground }]}
          numberOfLines={1}
        >
          {expanded ? fullLine(lift) : compactLine(lift)}
        </Text>
        {expanded && (
          <Text style={[styles.liftVolume, { color: colors.mutedForeground }]}>
            {`${grouped(lift.volumeKg)} kg`}
          </Text>
        )}
      </View>
    </View>
  );
}

export function LastWorkoutCard({ view, expanded = false }: LastWorkoutCardProps) {
  const { colors } = useTheme();
  const workout = view === null ? null : view.lastWorkout;

  if (workout === null) {
    return (
      <View>
        <CardHeader label={LABEL} chevron={false} />
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {view === null ? SKELETON : EMPTY}
        </Text>
      </View>
    );
  }

  const lifts = expanded ? workout.lifts : workout.lifts.slice(0, MAX_LIFTS);
  const hidden = workout.lifts.length - lifts.length;

  return (
    <View style={styles.card}>
      <CardHeader label={LABEL} chevron={!expanded} />
      <Text
        style={[styles.title, { color: colors.foreground }]}
        numberOfLines={expanded ? 2 : 1}
      >
        {workout.title}
      </Text>
      <CardCaption>
        {joinDetails(relativeTime(workout.at), `${grouped(totalVolume(workout.lifts))} kg`)}
      </CardCaption>
      <View style={styles.rows}>
        {lifts.map((lift, index) => (
          <Fragment key={lift.title}>
            {expanded && index > 0 && <RowDivider />}
            <LiftRow lift={lift} expanded={expanded} />
          </Fragment>
        ))}
      </View>
      {hidden > 0 && (
        <View style={styles.more}>
          <CardCaption>{`+${hidden} more`}</CardCaption>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rows: {
    paddingTop: 12,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowExpanded: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  liftTitle: {
    flexShrink: 1,
    fontSize: 15,
  },
  figures: {
    alignItems: 'flex-end',
  },
  liftValue: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  liftVolume: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  more: {
    paddingTop: 6,
  },
});
