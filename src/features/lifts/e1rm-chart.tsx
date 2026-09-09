import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { SessionEstimate } from './e1rm';
import { formatDate, formatKilograms } from './format';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 120;
const STROKE = 2;
const DOT = 6;
const MIN_POINTS = 2;
const DEGREES_PER_RADIAN = 180 / Math.PI;

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

type OneRepMaxChartProps = {
  readonly points: readonly SessionEstimate[];
};

/**
 * The one chart in the app: estimated 1RM per session, oldest on the left. It is labelled as an
 * estimate everywhere it appears, because that is what Epley gives.
 */
export function OneRepMaxChart({ points }: OneRepMaxChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const values = points.map((point) => point.estimateKg);
  const first = points.at(0);
  const last = points.at(-1);

  if (first === undefined || last === undefined || points.length < MIN_POINTS) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Two logged sessions with a load and reps draw a trend. There is one so far.
      </ThemedText>
    );
  }

  const drawn = plot(values, width);
  const highest = Math.max(...values);
  const lowest = Math.min(...values);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View style={styles.chart}>
      <ThemedText type="small" themeColor="textSecondary">
        {`High ${formatKilograms(highest)} · Low ${formatKilograms(lowest)}`}
      </ThemedText>

      <View
        onLayout={onLayout}
        style={[styles.canvas, { borderColor: theme.backgroundSelected }]}
        accessibilityRole="image"
        accessibilityLabel={`Estimated one rep max across ${points.length} sessions, from ${formatKilograms(first.estimateKg)} on ${formatDate(first.startTime)} to ${formatKilograms(last.estimateKg)} on ${formatDate(last.startTime)}.`}
      >
        {drawn?.segments.map((segment, index) => (
          <View
            // Segments are positions in a redrawn line, so their index is their identity.
            key={index}
            style={[
              styles.segment,
              {
                backgroundColor: theme.text,
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
              { backgroundColor: theme.text, left: drawn.lastPoint.left, top: drawn.lastPoint.top },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.axis}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(first.startTime)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(last.startTime)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    gap: Spacing.one,
  },
  canvas: {
    height: CHART_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
