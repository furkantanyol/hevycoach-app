/**
 * The plain-View bar chart: what the volume card draws when the native Swift
 * Charts path is off or unavailable. Seven columns bottom-aligned, each bar a
 * share of the tallest, with the day's first letter under it.
 */
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

/** The tallest a bar grows; every other bar is a share of it. */
const BAR_TRACK = 72;
/** A day with no volume is still a day, so it keeps a visible stub. */
const MIN_BAR_HEIGHT = 4;
const BAR_RADIUS = 3;

type ByDay = CardsView['weekVolume']['byDay'];

function barHeight(kg: number, peak: number): number {
  return Math.max(MIN_BAR_HEIGHT, Math.round((kg / peak) * BAR_TRACK));
}

export function Bars({ byDay }: { readonly byDay: ByDay }) {
  const { colors } = useTheme();
  // A week with nothing logged would divide by zero; 1 kg keeps every bar at
  // the stub height instead.
  const peak = Math.max(1, ...byDay.map((entry) => entry.kg));

  return (
    <View style={styles.row}>
      {byDay.map((entry) => (
        <View key={entry.day} style={styles.column}>
          <View
            style={[
              styles.bar,
              { height: barHeight(entry.kg, peak), backgroundColor: colors.accent },
            ]}
          />
          <Text style={[styles.day, { color: colors.mutedForeground }]}>{entry.day.charAt(0)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bar: {
    width: '70%',
    borderRadius: BAR_RADIUS,
  },
  day: {
    fontSize: 11,
  },
});
