/**
 * Everything around a step's questions: how far along the flow is, the two
 * buttons at the foot, and the error line. Errors are grey text with a Retry,
 * not red: the palette has one accent and it belongs to the answer the user
 * chose, so a failure says what happened in words instead of colour.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { REVIEW_STEP } from '../../lib/onboarding-steps';
import { Radius, useTheme } from '../assistant-ui/theme';

const BACK_LABEL = 'Back';
const RETRY_LABEL = 'Retry';
const TAP_TARGET = 44;
const BUTTON_HEIGHT = 50;
const PRESSED_OPACITY = 0.7;
const TRACK_HEIGHT = 3;
const PERCENT = 100;

/** "Step 3 of 6", with Hevy's hairline track under it. */
export function StepProgress({ step }: { readonly step: number }) {
  const { colors } = useTheme();
  const width = `${(step / REVIEW_STEP) * PERCENT}%` as const;

  return (
    <View style={styles.progress}>
      <Text
        accessibilityRole="text"
        style={[styles.progressLabel, { color: colors.mutedForeground }]}
      >
        {`Step ${step} of ${REVIEW_STEP}`}
      </Text>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View style={[styles.fill, { backgroundColor: colors.accent, width }]} />
      </View>
    </View>
  );
}

export function PrimaryButton({
  label,
  disabled,
  busy,
  onPress,
}: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly onPress: () => void;
}) {
  const { colors } = useTheme();
  const off = disabled === true || busy === true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: busy === true }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: disabled === true ? colors.muted : colors.accent },
        pressed && { opacity: PRESSED_OPACITY },
      ]}
    >
      {busy === true ? <ActivityIndicator color={colors.accentForeground} /> : null}
      <Text
        style={[
          styles.primaryLabel,
          { color: disabled === true ? colors.mutedForeground : colors.accentForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && { opacity: PRESSED_OPACITY }]}
    >
      <Text style={[styles.textButtonLabel, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

/** A failure in words, in the same grey the captions use, with the way out next to it. */
export function ErrorLine({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.error}>
      <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{message}</Text>
      <TextButton label={RETRY_LABEL} onPress={onRetry} />
    </View>
  );
}

export function StepFooter({
  onBack,
  onContinue,
  continueLabel,
  disabled,
}: {
  readonly onBack: (() => void) | null;
  readonly onContinue: () => void;
  readonly continueLabel: string;
  readonly disabled: boolean;
}) {
  return (
    <View style={styles.footer}>
      {onBack ? <TextButton label={BACK_LABEL} onPress={onBack} /> : <View style={styles.spacer} />}
      <View style={styles.grow}>
        <PrimaryButton label={continueLabel} disabled={disabled} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: {
    gap: 8,
    paddingBottom: 4,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  track: {
    borderRadius: Radius.pill,
    height: TRACK_HEIGHT,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_HEIGHT,
  },
  primary: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: BUTTON_HEIGHT,
    paddingHorizontal: 20,
  },
  primaryLabel: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  textButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP_TARGET,
    minWidth: TAP_TARGET,
    paddingHorizontal: 12,
  },
  textButtonLabel: {
    fontSize: 17,
    fontWeight: '500',
  },
  error: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  errorText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  spacer: {
    width: 4,
  },
  grow: {
    flex: 1,
  },
});
