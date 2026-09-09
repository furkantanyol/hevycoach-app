import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The heading a sheet gives a session or a page. Set once here; no screen overrides it. */
const SUBTITLE_SIZE = 22;
const SUBTITLE_LINE_HEIGHT = 28;

type TextType = 'default' | 'small' | 'subtitle';

export type ThemedTextProps = TextProps & {
  type?: TextType;
  themeColor?: ThemeColor;
};

/**
 * iOS scales each text style on its own Dynamic Type curve, and those curves diverge at the
 * accessibility sizes. Naming the ramp each variant belongs to keeps the hierarchy in proportion
 * with the native large title above it instead of scaling everything by one flat multiplier.
 */
const ramps: Record<TextType, TextProps['dynamicTypeRamp']> = {
  small: 'subheadline',
  default: 'body',
  subtitle: 'title1',
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? 'ink'];

  return <Text dynamicTypeRamp={ramps[type]} style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  subtitle: {
    fontSize: SUBTITLE_SIZE,
    lineHeight: SUBTITLE_LINE_HEIGHT,
    fontWeight: 600,
  },
});
