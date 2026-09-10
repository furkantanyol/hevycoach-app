/**
 * The three numbers Hevy puts at the top of a profile: how much training there
 * is, how much of it landed this week, and how far back the history goes. One
 * card, three columns, the grey small-cap label the rest of the app uses.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Radius, useTheme } from '../assistant-ui/theme';

const UNKNOWN = '—';

interface ProgressStatsProps {
  readonly workouts: number;
  readonly thisWeek: number;
  readonly firstWorkout: string | null;
}

interface Stat {
  readonly label: string;
  readonly value: string;
}

/** The year alone: the first workout's day and month say nothing at this size. */
function firstYear(iso: string | null): string {
  if (!iso) return UNKNOWN;
  const first = new Date(iso);
  return Number.isNaN(first.getTime()) ? UNKNOWN : String(first.getFullYear());
}

export function ProgressStats({ workouts, thisWeek, firstWorkout }: ProgressStatsProps) {
  const { colors } = useTheme();
  const stats: readonly Stat[] = [
    { label: 'Workouts', value: String(workouts) },
    { label: 'This week', value: String(thisWeek) },
    { label: 'Since', value: firstYear(firstWorkout) },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.stat}>
          <Text style={[styles.value, { color: colors.cardForeground }]}>{stat.value}</Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {stat.label.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  stat: {
    flex: 1,
    gap: 4,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
});
