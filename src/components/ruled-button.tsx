import { Pressable, StyleSheet, Text } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MIN_TAP_TARGET = 44;
const LABEL_SIZE = 16;
const PRESSED_OPACITY = 0.55;

type RuledButtonProps = {
  readonly title: string;
  readonly onPress: () => void;
  /** The one action a screen is actually for. It is filled with ink, never with the marker. */
  readonly primary?: boolean;
  readonly disabled?: boolean;
};

/**
 * An action, drawn as a box ruled on the sheet. The platform's own button is a blue word, and blue
 * is not a colour this world has — the marker is the only chromatic ink here and it belongs to
 * today alone, so a filled action is filled with ink instead.
 */
export function RuledButton({ title, onPress, primary = false, disabled = false }: RuledButtonProps) {
  const theme = useTheme();

  const filled = primary && !disabled;
  const border = disabled ? theme.rule : theme.ink;
  const fill = filled ? theme.ink : 'transparent';
  const label = filled ? theme.ground : theme.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderColor: border, backgroundColor: fill, opacity: pressed ? PRESSED_OPACITY : 1 },
      ]}
    >
      <Text
        dynamicTypeRamp="body"
        style={[styles.label, { color: disabled ? theme.inkSecondary : label }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  label: {
    fontSize: LABEL_SIZE,
    fontWeight: '600',
  },
});
