/**
 * One card shell for all three pages. iOS 26 draws it as Liquid Glass; every
 * other runtime gets the flat card from the design brief — the ground colour
 * with a hairline border — at the same radius and padding, so the carousel
 * lays out identically either way.
 *
 * `isGlassEffectAPIAvailable()` rather than `isLiquidGlassAvailable()`: the
 * former is the crash guard (some iOS 26 betas ship without the API), the
 * latter only reports whether the app is drawing in the Liquid Glass style.
 */
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../assistant-ui/theme';

const CARD_RADIUS = 20;
const CARD_PADDING = 16;

export function GlassCard({ children }: { readonly children: ReactNode }) {
  const { colors } = useTheme();

  if (isGlassEffectAPIAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" style={styles.card}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.card,
        styles.flat,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
  },
  flat: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
