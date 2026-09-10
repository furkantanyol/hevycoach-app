/**
 * One lift, the way Hevy shows an exercise in its history: the name, how often
 * it has been trained, the best set on record, and the estimated one-rep max of
 * the last sessions. The arrow compares the newest e1RM to the oldest of those,
 * which is the whole of what a chart would say here, in one line and no library.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Lift } from '../../lib/types';
import { Radius, useTheme } from '../assistant-ui/theme';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const TREND_SEPARATOR = ' · ';
const TITLE_LINES = 1;

const ARROWS = { up: '↑', down: '↓', flat: '→' } as const;
const ARROW_WORDS = { up: 'up', down: 'down', flat: 'flat' } as const;

type Direction = keyof typeof ARROWS;

/**
 * Whole days between two calendar days, not 24-hour periods: a session logged
 * late yesterday is "yesterday" this morning, not "today". The arithmetic runs
 * in UTC on local day numbers so a daylight-saving change cannot shift it.
 */
function calendarDaysAgo(iso: string): number | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.round((today - day) / MS_PER_DAY);
}

function ago(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

function relativeDay(iso: string): string | null {
  const days = calendarDaysAgo(iso);
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < DAYS_PER_WEEK) return ago(days, 'day');
  if (days < DAYS_PER_MONTH) return ago(Math.round(days / DAYS_PER_WEEK), 'week');
  if (days < DAYS_PER_YEAR) return ago(Math.round(days / DAYS_PER_MONTH), 'month');
  return ago(Math.round(days / DAYS_PER_YEAR), 'year');
}

function sessionLine(lift: Lift): string {
  const sessions = `${lift.sessions} session${lift.sessions === 1 ? '' : 's'}`;
  const last = relativeDay(lift.lastPerformed);
  return last ? `${sessions} · last ${last}` : sessions;
}

/** A bodyweight lift is logged at 0 kg; the reps are the whole of the set. */
function bestSet(lift: Lift): string | null {
  if (lift.bestReps <= 0) return null;
  if (lift.bestWeightKg <= 0) return `${lift.bestReps} reps`;
  return `${lift.bestWeightKg} kg × ${lift.bestReps}`;
}

function directionOf(trend: readonly number[]): Direction {
  const first = trend[0];
  const last = trend[trend.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

function Stat({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Trend({ trend }: { readonly trend: readonly number[] }) {
  const { colors } = useTheme();
  const numbers = trend.join(TREND_SEPARATOR);
  const direction = trend.length > 1 ? directionOf(trend) : null;
  const spoken = direction ? `${numbers}, ${ARROW_WORDS[direction]}` : numbers;

  return (
    <Text
      accessibilityLabel={spoken}
      style={[styles.statValue, { color: colors.cardForeground }]}
    >
      {numbers}
      {direction ? `  ${ARROWS[direction]}` : ''}
    </Text>
  );
}

export function LiftCard({ lift }: { readonly lift: Lift }) {
  const { colors } = useTheme();
  const best = bestSet(lift);
  const hasTrend = lift.e1rmTrend.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text
          numberOfLines={TITLE_LINES}
          style={[styles.title, { color: colors.cardForeground }]}
        >
          {lift.title}
        </Text>
        <Text style={[styles.frequency, { color: colors.mutedForeground }]}>
          {`${lift.weeklyFrequency}/wk`}
        </Text>
      </View>
      <Text style={[styles.sessions, { color: colors.mutedForeground }]}>{sessionLine(lift)}</Text>
      {best !== null || hasTrend ? (
        <View style={styles.stats}>
          {best !== null ? (
            <Stat label="Best">
              <Text style={[styles.statValue, { color: colors.cardForeground }]}>{best}</Text>
            </Stat>
          ) : null}
          {hasTrend ? (
            <Stat label="e1RM">
              <Trend trend={lift.e1rmTrend} />
            </Stat>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  header: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  frequency: {
    flexShrink: 0,
    fontSize: 13,
  },
  sessions: {
    fontSize: 13,
  },
  stats: {
    columnGap: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 8,
    rowGap: 8,
  },
  stat: {
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '500',
  },
});
