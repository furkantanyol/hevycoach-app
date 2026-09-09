import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { loadStep } from './load-band';
import { Rule } from './motion';

import { Figures, LOAD_STEPS, Spacing, loadColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STRIP_HEIGHT = 88;
const BAND_MAX_HEIGHT = 52;
const TRAVEL_MS = 180;
const INSTANT_MS = 0;
const LABEL_SIZE = 12;
const FIGURE_SIZE = 13;

export type WeekDay = {
  readonly key: string;
  /** One or two letters, as a printed sheet heads its columns: M, T, W. */
  readonly label: string;
  /** The session's own stored target volume. Zero is a day with nothing planned on it. */
  readonly volume: number;
};

type WeekStripProps = {
  readonly days: readonly WeekDay[];
  readonly selectedKey: string;
  readonly onSelect: (key: string) => void;
};

/**
 * The week as columns, and the app's only navigation between days. The marker travels along it
 * under the finger and the table beneath re-rules to wherever it lands, so the chart and the
 * detail are one gesture rather than a header sitting above a list.
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
  const selected = Math.max(
    0,
    days.findIndex((day) => day.key === selectedKey)
  );

  const resting = selected * columnWidth;
  /** Where the finger has dragged the marker to; null whenever it is resting on a column. */
  const dragged = useSharedValue<number | null>(null);

  const selectAt = (x: number) => {
    const index = Math.min(days.length - 1, Math.max(0, Math.floor(x / columnWidth)));
    const day = days[index];
    if (day && day.key !== selectedKey) {
      onSelect(day.key);
    }
  };

  // The marker follows the finger frame by frame on the UI thread, then settles on the column it
  // was released over; the selection it reports back is what re-rules the table below.
  const travel = Gesture.Pan()
    .onUpdate((event) => {
      const highest = (days.length - 1) * columnWidth;
      const target = event.x - columnWidth / 2;
      dragged.value = Math.min(highest, Math.max(0, target));
    })
    .onEnd((event) => {
      // Released: the marker settles onto whichever column it was over, and the table follows.
      dragged.value = null;
      runOnJS(selectAt)(event.x);
    });

  const tap = Gesture.Tap().onEnd((event) => {
    runOnJS(selectAt)(event.x);
  });

  const markerStyle = useAnimatedStyle(() => ({
    left: dragged.value ?? (reduceMotion ? resting : withTiming(resting, { duration: TRAVEL_MS })),
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View>
      <Rule />
      <GestureDetector gesture={Gesture.Exclusive(travel, tap)}>
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
          <Animated.View
            style={[
              styles.marker,
              markerStyle,
              { width: columnWidth, backgroundColor: theme.marker },
            ]}
          />
          {days.map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              week={days}
              onMarker={day.key === selectedKey}
              transitionMs={reduceMotion ? INSTANT_MS : TRAVEL_MS}
            />
          ))}
        </View>
      </GestureDetector>
      <Rule weight="ink" />
    </View>
  );
}

type DayColumnProps = {
  readonly day: WeekDay;
  readonly week: readonly WeekDay[];
  readonly onMarker: boolean;
  readonly transitionMs: number;
};

function DayColumn({ day, week, onMarker, transitionMs }: DayColumnProps) {
  const theme = useTheme();
  const step = loadStep(
    day.volume,
    week.map((other) => other.volume)
  );
  const ink = onMarker ? theme.inkOnMarker : theme.ink;

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
      <Text style={[styles.label, { color: ink }]}>{day.label}</Text>
      <Text style={[styles.figure, Figures.tabular, { color: ink }]}>
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
    height: STRIP_HEIGHT,
    flexDirection: 'row',
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  column: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Spacing.one,
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
