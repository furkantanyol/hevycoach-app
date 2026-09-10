/**
 * Before the coach has written anything: one grey line and the way into intake,
 * which ends by asking the coach for a block. No fabricated plan, no placeholder
 * sessions — the tab says what is true and offers the one thing that changes it.
 */
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, useTheme } from '../assistant-ui/theme';

const EMPTY_LINE = 'No block yet';
const SETUP_LABEL = 'Start setup';
const ONBOARDING: Href = '/onboarding';
const PRESSED_OPACITY = 0.7;

export function EmptyBlock() {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.line, { color: colors.mutedForeground }]}>{EMPTY_LINE}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens setup, which ends by building your block"
        onPress={() => router.push(ONBOARDING)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent },
          pressed && { opacity: PRESSED_OPACITY },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: colors.accentForeground }]}>{SETUP_LABEL}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: 16,
    paddingVertical: 24,
  },
  line: {
    fontSize: 16,
    lineHeight: 22,
  },
  button: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
