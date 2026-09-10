/**
 * The shell every tab shares: the app ground under the status bar, and Hevy's
 * large title at the top left. Kept in one place so the four tabs open the
 * same way the thread does.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing, useTheme } from './assistant-ui/theme';

export function Screen({ children }: { readonly children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenTitle({ children }: { readonly children: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
      {children}
    </Text>
  );
}

/** The grey small-cap label Hevy puts over a group of rows. */
export function SectionLabel({ children }: { readonly children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
      {children.toUpperCase()}
    </Text>
  );
}

export function InlineError({ children }: { readonly children: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inlineError}>
      <Text style={[styles.inlineErrorText, { color: colors.destructive }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    paddingHorizontal: Spacing.gutter,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  inlineError: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: 8,
  },
  inlineErrorText: {
    fontSize: 15,
    lineHeight: 20,
  },
});
