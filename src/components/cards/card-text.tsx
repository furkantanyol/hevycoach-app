/**
 * The two text roles every card shares, so the three cards agree on the label
 * and caption without repeating the type scale. Values and titles differ per
 * card and stay in the card's own stylesheet.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../assistant-ui/theme';

/** What a card shows in place of its value while GET /cards is still in flight. */
export const SKELETON = '—';

/** Hevy's widget label: small, tracked, uppercase, secondary. */
export function CardLabel({ children }: { readonly children: ReactNode }) {
  const { colors } = useTheme();

  return <Text style={[styles.label, { color: colors.mutedForeground }]}>{children}</Text>;
}

/** The design brief's caption style: 13/400 in secondary. */
export function CardCaption({ children }: { readonly children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <Text style={[styles.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  caption: {
    fontSize: 13,
    fontWeight: '400',
  },
});
