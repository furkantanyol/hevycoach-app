/**
 * Hevy's card: the card colour, a one-point hairline-grey border, sixteen-point
 * corners and padding. One shell for the three carousel pages and for the
 * expanded copy of a page, so they lay out identically.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, useTheme } from '../assistant-ui/theme';

export const CARD_PADDING = 16;
/** A full point, as Hevy draws it: a hairline disappears at a glance. */
const CARD_BORDER = 1;

interface CardProps {
  readonly children: ReactNode;
  /** The pager and the expanded copy fill their box; a card in the thread sizes to its content. */
  readonly style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.card,
    borderWidth: CARD_BORDER,
    padding: CARD_PADDING,
    // The expanded card grows over its content, which must clip at the radius, not spill.
    overflow: 'hidden',
  },
});
