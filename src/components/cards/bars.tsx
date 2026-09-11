/**
 * The two drawings of the week's seven days: `Bars`, Hevy's own widget (seven
 * bare bars with a letter under each and no axes) for the card, and `DayRows`,
 * one labelled row per day with its figure, for the expanded card. Today is
 * marked in both, so the week reads from where the athlete stands in it.
 */
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { grouped } from './format';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView, DayVolume } from '../../lib/types';

type ByDay = CardsView['weekVolume']['byDay'];

/** A day with no volume is still a day, so it keeps a visible stub in the hairline grey. */
const STUB_HEIGHT = 4;
/** The shortest a lifted day's bar may be, as a share of the track, so a light day still reads as a bar. */
const MIN_BAR_PERCENT = 6;
const PERCENT = 100;
const BAR_RADIUS = 4;
/** Hevy leaves air between the columns rather than filling them. */
const BAR_WIDTH = '44%';
const LETTERS_GAP = 6;
const ROW_HEIGHT = 34;
const TRACK_HEIGHT = 8;
const DAY_COLUMN = 44;
const VALUE_COLUMN = 88;
const DAYS_PER_WEEK = 7;
const SUNDAY_SHIFT = 6;
const NO_VOLUME = '—';

/** Monday is 0, the way the server orders `byDay`; `getDay` puts Sunday first. */
function todayIndex(now: Date = new Date()): number {
  return (now.getDay() + SUNDAY_SHIFT) % DAYS_PER_WEEK;
}

const peakOf = (byDay: ByDay): number => Math.max(0, ...byDay.map((entry) => entry.kg));

function barHeight(kg: number, peak: number): DimensionValue {
  if (kg === 0 || peak === 0) return STUB_HEIGHT;
  return `${Math.max(MIN_BAR_PERCENT, Math.round((kg / peak) * PERCENT))}%`;
}

/** "Mon 8,420 kg, Wed 4,200 kg": the chart, for a reader who cannot see the bars. */
export function describeWeek(byDay: ByDay): string {
  const lifted = byDay.filter((entry) => entry.kg > 0);
  if (lifted.length === 0) return 'Nothing logged this week';
  return lifted.map((entry) => `${entry.day} ${grouped(entry.kg)} kg`).join(', ');
}

export function Bars({ byDay }: { readonly byDay: ByDay }) {
  const { colors } = useTheme();
  const peak = peakOf(byDay);
  const today = todayIndex();

  return (
    <View style={styles.chart}>
      <View style={styles.bars}>
        {byDay.map((entry) => (
          <View key={entry.day} style={styles.column}>
            <View
              style={[
                styles.bar,
                {
                  height: barHeight(entry.kg, peak),
                  backgroundColor: entry.kg === 0 ? colors.border : colors.accent,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.letters}>
        {byDay.map((entry, index) => (
          <Text
            key={entry.day}
            style={[
              styles.letter,
              index === today
                ? [styles.today, { color: colors.foreground }]
                : { color: colors.mutedForeground },
            ]}
          >
            {entry.day.charAt(0)}
          </Text>
        ))}
      </View>
    </View>
  );
}

interface DayRowProps {
  readonly entry: DayVolume;
  readonly peak: number;
  readonly isToday: boolean;
}

function DayRow({ entry, peak, isToday }: DayRowProps) {
  const { colors } = useTheme();
  const rested = entry.kg === 0;
  const share = peak === 0 ? 0 : (entry.kg / peak) * PERCENT;

  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.dayName,
          isToday ? [styles.today, { color: colors.foreground }] : { color: colors.mutedForeground },
        ]}
      >
        {entry.day}
      </Text>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        {!rested && (
          <View style={[styles.fill, { width: `${share}%`, backgroundColor: colors.accent }]} />
        )}
      </View>
      <Text style={[styles.value, { color: rested ? colors.mutedForeground : colors.foreground }]}>
        {rested ? NO_VOLUME : `${grouped(entry.kg)} kg`}
      </Text>
    </View>
  );
}

export function DayRows({ byDay }: { readonly byDay: ByDay }) {
  const peak = peakOf(byDay);
  const today = todayIndex();

  return (
    <View>
      {byDay.map((entry, index) => (
        <DayRow key={entry.day} entry={entry} peak={peak} isToday={index === today} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flex: 1,
    gap: LETTERS_GAP,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_RADIUS,
  },
  letters: {
    flexDirection: 'row',
  },
  letter: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
  today: {
    fontWeight: '700',
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayName: {
    width: DAY_COLUMN,
    fontSize: 15,
    fontWeight: '500',
  },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: TRACK_HEIGHT / 2,
  },
  value: {
    width: VALUE_COLUMN,
    textAlign: 'right',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
});
