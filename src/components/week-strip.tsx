import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { loadStep } from './load-band';
import { Rule } from './motion';

import { Figures, LOAD_STEPS, MARKER_EDGE_WIDTH, Spacing, loadColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STRIP_HEIGHT = 88;
/** How far sideways the finger commits before the reading, rather than the sheet, takes the drag. */
const ACTIVATION_SLOP = 10;
const BAND_MAX_HEIGHT = 52;
/** The heavy ruling drawn under whichever column is being read. */
const READING_HEIGHT = 3;
const TRAVEL_MS = 180;
const INSTANT_MS = 0;
const LABEL_SIZE = 12;
const FIGURE_SIZE = 13;
/** How far a column head may shrink to stay in its column when Dynamic Type enlarges it. */
const MINIMUM_LABEL_SCALE = 0.7;

export type WeekDay = {
  readonly key: string;
  /** One or two letters, as a printed sheet heads its columns: M, T, W. */
  readonly label: string;
  /** The session's own stored target volume. Zero is a day with nothing planned on it. */
  readonly volume: number;
  /** The real calendar today, which is the only thing the marker is ever drawn on. */
  readonly isToday: boolean;
};

type WeekStripProps = {
  readonly days: readonly WeekDay[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
};

/**
 * The week as columns, and the app's only navigation between days. Two marks live on it and they
 * mean different things: the fluorescent marker is struck across today and stays there, and the
 * heavy ruling under a column travels with the finger to say which day the table below is showing.
 * Drag away and today is still highlighted, because a highlighter cannot be moved once struck.
 *
 * Band darkness and band height both encode the same real thing: that session's own stored target
 * volume ranked against the other sessions in this week. No band is labelled, because a label
 * would make a display scale look like a prescription.
 */
export function WeekStrip({ days, selectedKey, onSelect }: WeekStripProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);

  const columnWidth = days.length > 0 ? width / days.length : 0;
  /** The last column's left edge: as far as the reading may travel before it leaves the week. */
  const highestReading = Math.max(0, (days.length - 1) * columnWidth);
  const selected = Math.max(
    0,
    days.findIndex((day) => day.key === selectedKey)
  );
  const today = days.findIndex((day) => day.isToday);

  const resting = selected * columnWidth;
  /** Where the finger has dragged the reading to; null whenever it is resting on a column. */
  const dragged = useSharedValue<number | null>(null);

  /** Called from the gesture: it is deliberately cheap and idempotent, see `readingGesture`. */
  const selectAt = (x: number) => {
    const index = Math.min(days.length - 1, Math.max(0, Math.floor(x / columnWidth)));
    const day = days[index];
    if (day && day.key !== selectedKey) {
      onSelect(day.key);
    }
  };

  // Everything the gesture needs off `days` is measured here, on the JS thread, as numbers.
  const reading = readingGesture({ columnWidth, highestReading, dragged, selectAt });

  const readingStyle = useAnimatedStyle(() => ({
    left: dragged.value ?? (reduceMotion ? resting : withTiming(resting, { duration: TRAVEL_MS })),
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View>
      <Rule />
      <GestureDetector gesture={reading}>
        <View
          onLayout={onLayout}
          style={styles.strip}
          accessibilityRole="adjustable"
          accessibilityLabel="Week"
          accessibilityValue={{ text: days[selected]?.label }}
          accessibilityActions={ADJUST_ACTIONS}
          onAccessibilityAction={(event) => {
            const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            const day = days[Math.min(days.length - 1, Math.max(0, selected + step))];
            if (day) {
              onSelect(day.key);
            }
          }}
        >
          {today < 0 ? null : (
            <View
              style={[
                styles.marker,
                {
                  left: today * columnWidth,
                  width: columnWidth,
                  backgroundColor: theme.marker,
                  borderColor: theme.inkOnMarker,
                },
              ]}
            />
          )}
          <Animated.View
            style={[styles.reading, readingStyle, { width: columnWidth, backgroundColor: theme.ink }]}
          />
          {days.map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              week={days}
              transitionMs={reduceMotion ? INSTANT_MS : TRAVEL_MS}
            />
          ))}
        </View>
      </GestureDetector>
      <Rule weight="ink" />
    </View>
  );
}

type ReadingGesture = {
  /** One column's width in points. The reading is a column wide and is centred on the finger. */
  readonly columnWidth: number;
  /** The furthest left edge the reading may travel to, which is the last column's. */
  readonly highestReading: number;
  /** Where the finger has dragged the reading to; null whenever it is resting on a column. */
  readonly dragged: SharedValue<number | null>;
  readonly selectAt: (x: number) => void;
};

/**
 * The reading follows the finger frame by frame on the UI thread, then settles on the column it
 * was released over; the selection it reports back is what re-rules the table below.
 *
 * Built out here, away from the component, on purpose. Every gesture callback below is a worklet,
 * and Reanimated copies each variable the body names onto the UI thread — so naming `days` in one
 * would try to copy the `Date` each entry carries and red-screen the app on the first frame. Out
 * here `days` is not in scope to be named: only numbers, the shared value and `selectAt` cross
 * over, and `selectAt` crosses as a reference that `runOnJS` calls back on the JS thread, where
 * its own closure over `days` still lives. Pass primitives in; never an array, object or `Date`.
 */
function readingGesture({ columnWidth, highestReading, dragged, selectAt }: ReadingGesture) {
  const travel = Gesture.Pan()
    // The strip lives inside a scrolling sheet, so the reading only takes the gesture once the
    // finger has committed sideways; anything vertical stays with the scroll.
    .activeOffsetX([-ACTIVATION_SLOP, ACTIVATION_SLOP])
    .failOffsetY([-ACTIVATION_SLOP, ACTIVATION_SLOP])
    .onUpdate((event) => {
      const target = event.x - columnWidth / 2;
      dragged.value = Math.min(highestReading, Math.max(0, target));
      // The table re-rules under the finger rather than on release, which is what ties the chart
      // to the detail. `selectAt` is a no-op until the reading crosses into the next column, so
      // this renders once per column crossed and not once per frame.
      runOnJS(selectAt)(event.x);
    })
    .onEnd(() => {
      // Released: the reading settles onto the column the table is already showing.
      dragged.value = null;
    });

  const tap = Gesture.Tap().onEnd((event) => {
    runOnJS(selectAt)(event.x);
  });

  return Gesture.Exclusive(travel, tap);
}

type DayColumnProps = {
  readonly day: WeekDay;
  readonly week: readonly WeekDay[];
  readonly transitionMs: number;
};

function DayColumn({ day, week, transitionMs }: DayColumnProps) {
  const theme = useTheme();
  const step = loadStep(
    day.volume,
    week.map((other) => other.volume)
  );
  const ink = day.isToday ? theme.inkOnMarker : theme.ink;

  return (
    <View style={styles.column}>
      <View style={styles.bandSlot}>
        {step === null ? null : (
          <Animated.View
            style={{
              height: (step / LOAD_STEPS.length) * BAND_MAX_HEIGHT,
              backgroundColor: loadColor(theme, step),
              transitionProperty: 'background-color',
              transitionDuration: transitionMs,
            }}
          />
        )}
      </View>
      {/* A column is a fixed width and Dynamic Type is not, so a head shrinks to stay in its
          column; the strip itself grows rather than clipping what it cannot shrink. */}
      <Text
        dynamicTypeRamp="caption1"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={MINIMUM_LABEL_SCALE}
        style={[styles.label, { color: ink }]}
      >
        {day.label}
      </Text>
      <Text
        dynamicTypeRamp="caption1"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={MINIMUM_LABEL_SCALE}
        style={[styles.figure, Figures.tabular, { color: ink }]}
      >
        {day.volume > 0 ? String(day.volume) : ''}
      </Text>
    </View>
  );
}

const ADJUST_ACTIONS = [
  { name: 'increment' as const, label: 'Next day' },
  { name: 'decrement' as const, label: 'Previous day' },
];

const styles = StyleSheet.create({
  strip: {
    minHeight: STRIP_HEIGHT,
    flexDirection: 'row',
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: MARKER_EDGE_WIDTH,
    borderRightWidth: MARKER_EDGE_WIDTH,
  },
  reading: {
    position: 'absolute',
    bottom: 0,
    height: READING_HEIGHT,
  },
  column: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Spacing.two,
  },
  bandSlot: {
    height: BAND_MAX_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.one,
  },
  label: {
    fontSize: LABEL_SIZE,
    fontWeight: '600',
    textAlign: 'center',
  },
  figure: {
    fontSize: FIGURE_SIZE,
    fontWeight: '500',
    textAlign: 'center',
  },
});
