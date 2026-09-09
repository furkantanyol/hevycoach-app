import { StyleSheet, Text, View, type TextProps } from 'react-native';

import { ThemedText } from './themed-text';

import { Figures, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STAMP_SIZE = 11;
const STAMP_TRACKING = 1.4;
const STAMP_LINE_HEIGHT = 14;

type StampProps = Omit<TextProps, 'children'> & {
  readonly children: string;
  /** A stamp on the marker is written in near-black, the way a highlighter leaves text alone. */
  readonly onMarker?: boolean;
};

/**
 * The small tracked caps a printed programme sheet uses for its headings: BLOCK, WEEK, TARGET,
 * LAST. It labels a column or a section and is never the thing being read, so it stays small and
 * secondary while the figures beside it carry the size.
 */
export function Stamp({ children, onMarker = false, style, ...rest }: StampProps) {
  const theme = useTheme();

  return (
    <Text
      dynamicTypeRamp="caption1"
      style={[styles.stamp, { color: onMarker ? theme.inkOnMarker : theme.inkSecondary }, style]}
      {...rest}
    >
      {children.toUpperCase()}
    </Text>
  );
}

type StampedFieldProps = {
  readonly stamp: string;
  readonly value: string;
  /** Stamped against the right edge, where a sheet puts its date. */
  readonly trailing?: boolean;
};

/**
 * A stamped field: the tracked caps naming a thing, and the thing under them in tabular figures.
 * It is how the sheet heads itself — BLOCK, WEEK, SESSIONS — and it is the only header this world
 * has, because a card with a title would be the dashboard this design refuses.
 */
export function StampedField({ stamp, value, trailing = false }: StampedFieldProps) {
  return (
    <View style={trailing ? styles.trailing : null}>
      <Stamp style={trailing ? styles.trailingText : null}>{stamp}</Stamp>
      <ThemedText type="small" style={[Figures.tabular, trailing ? styles.trailingText : null]}>
        {value}
      </ThemedText>
    </View>
  );
}

/** Two stamped fields facing each other across the top of a sheet. */
export function StampedHead({ children }: { readonly children: React.ReactNode }) {
  return <View style={styles.head}>{children}</View>;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  trailing: {
    alignItems: 'flex-end',
  },
  trailingText: {
    textAlign: 'right',
  },
  stamp: {
    fontSize: STAMP_SIZE,
    lineHeight: STAMP_LINE_HEIGHT,
    letterSpacing: STAMP_TRACKING,
    fontWeight: '600',
  },
});
