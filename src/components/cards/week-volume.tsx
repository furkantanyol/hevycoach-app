/**
 * Card one: the week's total volume, the session count, and the seven days as
 * bars — Hevy's own widget, read from GET /cards.
 *
 * Swift Charts inside a SwiftUI `Host` was the intended renderer — that host
 * is the only place in the app allowed to hold SwiftUI, never a chat bubble —
 * but `NATIVE_CHART` is off, so the plain Views draw the bars. The gate is the
 * only difference between the two.
 */
import { Chart, Host } from '@expo/ui/swift-ui';
import { StyleSheet, Text, View } from 'react-native';

import { Bars } from './bars';
import { CardCaption, CardLabel, SKELETON } from './card-text';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

/** Off: Chart hides no axes (only showGrid/showLegend), so the plain bars match Hevy's widget. */
const NATIVE_CHART = false;
const LABEL = 'Volume';
const CHART_LABEL = 'Volume by day this week';
/** The one grey line the carousel shows when GET /cards failed. */
const UNAVAILABLE = 'Cards unavailable';
const KILO = 1000;
const BAR_RADIUS = 4;

type WeekVolume = CardsView['weekVolume'];

interface WeekVolumeCardProps {
  readonly view: CardsView | null;
  readonly error: string | null;
}

/** Hevy writes five figures as "38.3k kg" and anything smaller in whole kilos. */
function formatTotal(totalKg: number): string {
  if (totalKg >= KILO) return `${(totalKg / KILO).toFixed(1)}k kg`;
  return `${Math.round(totalKg)} kg`;
}

function sessionsLine(sessions: number): string {
  return sessions === 1 ? '1 session this week' : `${sessions} sessions this week`;
}

/**
 * Swift Charts plots a string x as a category, so the seven keys have to be
 * distinct: 'M', 'T', 'W', 'T', 'F', 'S', 'S' would fold Thursday into Tuesday
 * and Sunday into Saturday. The server's own 'Mon'…'Sun' are unique, and they
 * are what the axis labels.
 */
function NativeChart({ byDay }: { readonly byDay: WeekVolume['byDay'] }) {
  const { colors } = useTheme();
  const points = byDay.map((entry) => ({ x: entry.day, y: entry.kg, color: colors.accent }));

  return (
    <Host style={styles.host}>
      <Chart data={points} type="bar" barStyle={{ cornerRadius: BAR_RADIUS }} />
    </Host>
  );
}

/** Loading shows the skeleton; a failed request shows one grey line instead. */
function VolumePlaceholder({ error }: { readonly error: string | null }) {
  const { colors } = useTheme();

  return (
    <View>
      <CardLabel>{LABEL}</CardLabel>
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

export function WeekVolumeCard({ view, error }: WeekVolumeCardProps) {
  const { colors } = useTheme();
  const weekVolume = view === null ? null : view.weekVolume;

  if (weekVolume === null) return <VolumePlaceholder error={error} />;

  return (
    <View style={styles.card}>
      <View style={styles.figures}>
        <CardLabel>{LABEL}</CardLabel>
        <Text style={[styles.total, { color: colors.foreground }]} numberOfLines={1}>
          {formatTotal(weekVolume.totalKg)}
        </Text>
        <CardCaption>{sessionsLine(weekVolume.sessions)}</CardCaption>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={CHART_LABEL}
        style={styles.chart}
      >
        {NATIVE_CHART ? (
          <NativeChart byDay={weekVolume.byDay} />
        ) : (
          <Bars byDay={weekVolume.byDay} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  figures: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  chart: {
    flex: 1,
  },
  host: {
    flex: 1,
  },
  total: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  unavailable: {
    fontSize: 15,
    paddingTop: 4,
  },
});
