import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { SessionEstimate } from './e1rm';
import { formatDate } from './format';

import { Stamp } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { Figures, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 120;
const GUTTER_WIDTH = 48;
const STROKE = 2;
const DOT = 6;
const MIN_POINTS = 2;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const VALUE_SIZE = 12;
const VALUE_DECIMALS = 10;

type Segment = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly rotation: string;
};

type Plot = {
  readonly segments: Segment[];
  readonly lastPoint: { readonly left: number; readonly top: number };
};

/**
 * A polyline out of plain views: one view per segment, rotated about its left edge. That is the
 * smallest thing that draws a legible line — no drawing library, no native module, and nothing a
 * design system would later have to unpick.
 */
function plot(values: readonly number[], width: number): Plot | null {
  if (values.length < MIN_POINTS || width <= 0) {
    return null;
  }

  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const span = highest - lowest;
  const usableHeight = CHART_HEIGHT - STROKE;

  const x = (index: number) => (index / (values.length - 1)) * width;
  // A flat history has no span to scale against, so it draws down the middle rather than at an edge.
  const y = (value: number) =>
    STROKE / 2 + (span === 0 ? usableHeight / 2 : (1 - (value - lowest) / span) * usableHeight);

  const segments = values.slice(1).map((value, index) => {
    const fromX = x(index);
    const fromY = y(values[index]);
    const deltaX = x(index + 1) - fromX;
    const deltaY = y(value) - fromY;

    return {
      left: fromX,
      top: fromY - STROKE / 2,
      width: Math.hypot(deltaX, deltaY),
      rotation: `${Math.atan2(deltaY, deltaX) * DEGREES_PER_RADIAN}deg`,
    };
  });

  const lastValue = values[values.length - 1];

  return {
    segments,
    lastPoint: { left: width - DOT / 2, top: y(lastValue) - DOT / 2 },
  };
}

function figure(value: number): string {
  return String(Math.round(value * VALUE_DECIMALS) / VALUE_DECIMALS);
}

type OneRepMaxChartProps = {
  readonly points: readonly SessionEstimate[];
};

/**
 * The one chart in the app: estimated 1RM per session, oldest on the left, drawn as a ruled plot —
 * hairline axes, tabular figures against them, one ink line. It is labelled as an estimate
 * everywhere it appears, because that is what Epley gives, and it carries no marker: the
 * highlighter belongs to today alone.
 */
export function OneRepMaxChart({ points }: OneRepMaxChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const values = points.map((point) => point.estimateKg);
  const first = points.at(0);
  const last = points.at(-1);

  if (first === undefined || last === undefined || points.length < MIN_POINTS) {
    return (
      <ThemedText type="small" themeColor="inkSecondary">
        Two logged sessions with a load and reps draw a trend. There is one so far.
      </ThemedText>
    );
  }

  const drawn = plot(values, width);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View>
      <View style={styles.plot}>
        <View style={styles.gutter}>
          <Stamp style={styles.gutterStamp}>kg</Stamp>
          <Text style={[styles.value, Figures.tabular, { color: theme.inkSecondary }]}>
            {figure(highest)}
          </Text>
          <Text style={[styles.value, Figures.tabular, { color: theme.inkSecondary }]}>
            {figure(lowest)}
          </Text>
        </View>
        <View
          onLayout={onLayout}
          style={[styles.canvas, { borderColor: theme.rule }]}
          accessibilityRole="image"
          accessibilityLabel={`Estimated one rep max across ${points.length} sessions, from ${figure(first.estimateKg)} kilograms on ${formatDate(first.startTime)} to ${figure(last.estimateKg)} kilograms on ${formatDate(last.startTime)}.`}
        >
          {drawn?.segments.map((segment, index) => (
            <View
              // Segments are positions in a redrawn line, so their index is their identity.
              key={index}
              style={[
                styles.segment,
                {
                  backgroundColor: theme.ink,
                  left: segment.left,
                  top: segment.top,
                  width: segment.width,
                  transform: [{ rotate: segment.rotation }],
                },
              ]}
            />
          ))}
          {drawn ? (
            <View
              style={[
                styles.dot,
                { backgroundColor: theme.ink, left: drawn.lastPoint.left, top: drawn.lastPoint.top },
              ]}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.dates}>
        <Text style={[styles.value, Figures.tabular, { color: theme.inkSecondary }]}>
          {formatDate(first.startTime)}
        </Text>
        <Text style={[styles.value, Figures.tabular, { color: theme.inkSecondary }]}>
          {formatDate(last.startTime)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    flexDirection: 'row',
  },
  gutter: {
    width: GUTTER_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: Spacing.two,
  },
  gutterStamp: {
    position: 'absolute',
    top: -Spacing.three,
    right: Spacing.two,
  },
  canvas: {
    flex: 1,
    height: CHART_HEIGHT,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    position: 'absolute',
    height: STROKE,
    transformOrigin: 'left center',
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  dates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: GUTTER_WIDTH,
    paddingTop: Spacing.one,
  },
  value: {
    fontSize: VALUE_SIZE,
  },
});
