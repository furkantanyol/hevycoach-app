/**
 * One choice. Hevy's own pill: muted fill, the single accent when it is the
 * answer, never shorter than 44 pt. Its own file so the single- and
 * multi-select rows in fields.tsx cannot drift apart.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, useTheme } from '../assistant-ui/theme';

const TAP_TARGET = 44;
const PRESSED_OPACITY = 0.7;

export function Pill({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: selected ? colors.accent : colors.muted },
        pressed && { opacity: PRESSED_OPACITY },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? colors.accentForeground : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});
