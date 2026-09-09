import { StyleSheet, Text, type TextProps } from 'react-native';

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

const styles = StyleSheet.create({
  stamp: {
    fontSize: STAMP_SIZE,
    lineHeight: STAMP_LINE_HEIGHT,
    letterSpacing: STAMP_TRACKING,
    fontWeight: '600',
  },
});
