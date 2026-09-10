/**
 * The numeric field under the coach's last message when it asks for a number
 * instead of offering pills. The wire shape is `metadata.custom.input = { kind:
 * 'bodyweight', unit: 'kg' }` — see the "Amendment 2026-09-10 21:00" section of
 * docs/spec.md and `customOf` in src/coach-adapter.ts.
 *
 * Sending appends a plain user turn with no `choice` metadata, the way a pill
 * appends one with it (src/components/assistant-ui/choices.tsx), so the adapter
 * posts `{ text: '84' }`. That turn is then the last message, so the field goes
 * on its own. An implausible number keeps the button disabled and says nothing.
 */
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Radius, useTheme } from './theme';

/** iOS minimum touch target: the field's height and the send button's diameter. */
const CONTROL_SIZE = 44;
const FIELD_WIDTH = 140;
const FIELD_RADIUS = 12;
const MIN_KG = 30;
const MAX_KG = 250;
const MAX_DIGITS = 5;
const PLACEHOLDER = '82';
const SEND_GLYPH = '↑';
const SEND_LABEL = 'Send bodyweight';
const PRESSED_OPACITY = 0.7;
const DECIMAL_COMMA = ',';
const DECIMAL_POINT = '.';
const DEFAULT_UNIT = 'kg';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The unit to label the field with, or null when this message asks for no number. */
function readBodyweightUnit(custom: Record<string, unknown>): string | null {
  const { input } = custom;
  if (!isRecord(input) || input.kind !== 'bodyweight') return null;
  return typeof input.unit === 'string' ? input.unit : DEFAULT_UNIT;
}

/** Pills win when both arrive: the field is the answer to a question without them. */
function hasChoices(custom: Record<string, unknown>): boolean {
  return Array.isArray(custom.choices) && custom.choices.length > 0;
}

/** A plausible bodyweight, or null — which is the whole of the validation. */
function readWeight(value: string): number | null {
  const parsed = Number(value.replace(DECIMAL_COMMA, DECIMAL_POINT).trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed >= MIN_KG && parsed <= MAX_KG ? parsed : null;
}

type SendButtonProps = { readonly disabled: boolean; readonly onPress: () => void };

/** The 44pt accent circle beside the field; grey and inert until the number is plausible. */
function SendButton({ disabled, onPress }: SendButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityLabel={SEND_LABEL}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.send,
        { backgroundColor: disabled ? colors.border : colors.accent },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.sendGlyph,
          { color: disabled ? colors.mutedForeground : colors.accentForeground },
        ]}
      >
        {SEND_GLYPH}
      </Text>
    </Pressable>
  );
}

function BodyweightRow({ unit }: { readonly unit: string }) {
  const { colors } = useTheme();
  const aui = useAui();
  const [value, setValue] = useState('');
  const weight = readWeight(value);

  const send = useCallback(() => {
    if (weight === null) return;
    setValue('');
    aui.thread.append({ role: 'user', content: [{ type: 'text', text: String(weight) }] });
  }, [aui, weight]);

  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: colors.muted }]}>
        <TextInput
          accessibilityLabel={`Bodyweight in ${unit}`}
          keyboardType="decimal-pad"
          maxLength={MAX_DIGITS}
          onChangeText={setValue}
          placeholder={PLACEHOLDER}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
          value={value}
        />
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>{unit}</Text>
      </View>
      <SendButton disabled={weight === null} onPress={send} />
    </View>
  );
}

export function BodyweightInput() {
  const custom = useAuiState((s) => s.message.metadata.custom);
  const isLast = useAuiState((s) => s.message.isLast);
  const unit = readBodyweightUnit(custom);

  if (unit === null || !isLast || hasChoices(custom)) return null;
  return <BodyweightRow unit={unit} />;
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  field: {
    width: FIELD_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: CONTROL_SIZE,
    borderRadius: FIELD_RADIUS,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    minHeight: CONTROL_SIZE,
    paddingVertical: 0,
  },
  unit: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  send: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
  sendGlyph: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
  },
});
