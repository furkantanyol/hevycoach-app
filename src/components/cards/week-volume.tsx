/**
 * Card one: the week's total volume, the session count, and the seven days —
 * Hevy's widget bars on the card, one labelled row per day once the card is
 * expanded. Everything comes from GET /cards.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Bars, DayRows, describeWeek } from './bars';
import { CardCaption, CardHeader, SKELETON } from './card-text';
import { formatTotal, plural } from './format';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

const LABEL = 'Volume';
/** The one grey line the carousel shows when GET /cards failed. */
const UNAVAILABLE = 'Cards unavailable';

interface WeekVolumeCardProps {
  readonly view: CardsView | null;
  readonly error: string | null;
  readonly expanded?: boolean;
}

/** Loading shows the skeleton; a failed request shows one grey line instead. */
function VolumePlaceholder({ error }: { readonly error: string | null }) {
  const { colors } = useTheme();

  return (
    <View>
      <CardHeader label={LABEL} chevron={false} />
      {error === null ? (
        <Text style={[styles.total, { color: colors.foreground }]}>{SKELETON}</Text>
      ) : (
        <Text style={[styles.unavailable, { color: colors.mutedForeground }]} numberOfLines={1}>
          {UNAVAILABLE}
        </Text>
      )}
    </View>
  );
}

export function WeekVolumeCard({ view, error, expanded = false }: WeekVolumeCardProps) {
  const { colors } = useTheme();

  if (view === null) return <VolumePlaceholder error={error} />;
  const { totalKg, sessions, byDay } = view.weekVolume;

  return (
    <View style={styles.card}>
      <CardHeader label={LABEL} chevron={!expanded} />
      <Text style={[styles.total, { color: colors.foreground }]} numberOfLines={1}>
        {formatTotal(totalKg)}
      </Text>
      <CardCaption>{`${plural(sessions, 'session')} this week`}</CardCaption>
      {expanded ? (
        <View style={styles.rows}>
          <DayRows byDay={byDay} />
        </View>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={describeWeek(byDay)}
          style={styles.chart}
        >
          <Bars byDay={byDay} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  total: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  chart: {
    flex: 1,
    paddingTop: 12,
  },
  rows: {
    paddingTop: 12,
  },
  unavailable: {
    fontSize: 15,
    paddingTop: 4,
  },
});
