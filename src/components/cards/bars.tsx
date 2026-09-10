/**
 * The plain-View bar chart the volume card draws: Hevy's own widget, seven
 * bare bars with a single-letter day under each and no axes at all (which is
 * why the Swift Charts path is off — see `NATIVE_CHART` in week-volume.tsx).
 */
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

/** The tallest a bar grows; every other bar is a share of it. */
const BAR_TRACK = 72;
/** A day with no volume is still a day, so it keeps a visible stub. */
const MIN_BAR_HEIGHT = 4;
const BAR_RADIUS = 4;
/** Hevy leaves air between the columns rather than filling them. */
const BAR_WIDTH = '60%';

type ByDay = CardsView['weekVolume']['byDay'];

function barHeight(kg: number, peak: number): number {
  if (peak === 0) return MIN_BAR_HEIGHT;
  return Math.max(MIN_BAR_HEIGHT, Math.round((kg / peak) * BAR_TRACK));
}

export function Bars({ byDay }: { readonly byDay: ByDay }) {
  const { colors } = useTheme();
  // A week with nothing logged has no peak to divide by: every bar sits at the
  // stub, drawn in the hairline grey so it reads as an empty track, not a plan.
  const peak = Math.max(0, ...byDay.map((entry) => entry.kg));
  const barColor = peak === 0 ? colors.border : colors.accent;

  return (
    <View style={styles.row}>
      {byDay.map((entry) => (
        <View key={entry.day} style={styles.column}>
          <View
            style={[styles.bar, { height: barHeight(entry.kg, peak), backgroundColor: barColor }]}
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
    width: BAR_WIDTH,
    borderRadius: BAR_RADIUS,
  },
  day: {
    fontSize: 12,
    fontWeight: '500',
  },
});
