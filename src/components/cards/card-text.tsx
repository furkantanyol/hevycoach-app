/**
 * The text roles every card shares — the header row, the label, the caption
 * and the hairline between expanded rows — so the three cards agree without
 * repeating the type scale. Values and titles differ per card and stay in the
 * card's own stylesheet.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SystemIcon } from './system-icon';
import { useTheme } from '../assistant-ui/theme';

/** What a card shows in place of its value while GET /cards is still in flight. */
export const SKELETON = '—';
/** As tall as the expanded card's close button, so the label sits on its centreline. */
const HEADER_HEIGHT = 30;
const CHEVRON_SIZE = 13;

interface CardHeaderProps {
  readonly label: string;
  /** The disclosure chevron: shown when the card opens, gone once it has (the close button takes its place). */
  readonly chevron: boolean;
}

/** Hevy's widget label: small, tracked, uppercase, secondary. */
export function CardLabel({ children }: { readonly children: ReactNode }) {
  const { colors } = useTheme();

  return <Text style={[styles.label, { color: colors.mutedForeground }]}>{children}</Text>;
}

/** The row every card opens with. */
export function CardHeader({ label, chevron }: CardHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.header}>
      <CardLabel>{label}</CardLabel>
      {chevron && <SystemIcon name="chevron.right" size={CHEVRON_SIZE} color={colors.mutedForeground} />}
    </View>
  );
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

/** Hevy's hairline between the rows of an expanded list. */
export function RowDivider() {
  const { colors } = useTheme();

  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
