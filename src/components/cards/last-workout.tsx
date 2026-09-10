/**
 * Card two: the last session Hevy logged — its name, how long ago it was, and
 * its top four lifts by volume as the server ordered them.
 */
import { StyleSheet, Text, View } from 'react-native';

import { CardCaption, SKELETON } from './card-text';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

const MAX_LIFTS = 4;
const EMPTY = 'No workouts yet';
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

type LastWorkout = NonNullable<CardsView['lastWorkout']>;
type Lift = LastWorkout['lifts'][number];

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

/** Thousands separators without Intl, so the volume reads "1,800 kg". */
function grouped(kg: number): string {
  return Math.round(kg)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1);
}

function liftLine(lift: Lift): string {
  return `${lift.sets} × ${lift.reps} × ${formatWeight(lift.weightKg)} kg · ${grouped(lift.volumeKg)} kg`;
}

function LiftRow({ lift }: { readonly lift: Lift }) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.liftTitle, { color: colors.foreground }]} numberOfLines={1}>
        {lift.title}
      </Text>
      <Text style={[styles.liftValue, { color: colors.mutedForeground }]} numberOfLines={1}>
        {liftLine(lift)}
      </Text>
    </View>
  );
}

export function LastWorkoutCard({ view }: { readonly view: CardsView | null }) {
  const { colors } = useTheme();
  const workout = view === null ? null : view.lastWorkout;

  if (workout === null) {
    return (
      <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
        {view === null ? SKELETON : EMPTY}
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
        {workout.title}
      </Text>
      <CardCaption>{relativeTime(workout.at)}</CardCaption>
      <View style={styles.rows}>
        {workout.lifts.slice(0, MAX_LIFTS).map((lift) => (
          <LiftRow key={lift.title} lift={lift} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  rows: {
    paddingTop: 10,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  liftTitle: {
    flexShrink: 1,
    fontSize: 15,
  },
  liftValue: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
});
