/**
 * The four things an intake step is made of: a labelled question, a row of
 * pills (single or multi select), a numeric input, and the notes box. Pills
 * are drawn here rather than imported: no control library ships with the app,
 * and the brief forbids invented chrome, so a pill is Hevy's own — muted fill,
 * the one accent when it is the answer.
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { NOTES_MAX_CHARACTERS, usePrefilledFields } from '../../lib/onboarding-draft';
import type { ProfileField } from '../../lib/onboarding-steps';
import { FIELD_LABELS } from '../../lib/options';
import { Radius, useTheme } from '../assistant-ui/theme';
import { Pill } from './pill';

const PREFILL_CAPTION = 'from your Hevy history';
const NOTES_PLACEHOLDER = 'Anything the coach should know: pain, schedule, preferences.';
const NOTES_MIN_HEIGHT = 120;
const TAP_TARGET = 44;

/** cm and kg live next to the input; the rest of the label is in FIELD_LABELS. */
const UNITS: Partial<Readonly<Record<ProfileField, string>>> = {
  heightCm: 'cm',
  bodyweightKg: 'kg',
};

export interface Choice<T> {
  readonly value: T;
  readonly label: string;
}

/** A question owns its label and, when the answer is a guess, the grey caption under it. */
export function Question({
  field,
  children,
}: {
  readonly field: ProfileField;
  readonly children: ReactNode;
}) {
  const { colors } = useTheme();
  const prefilled = usePrefilledFields();

  return (
    <View style={styles.question}>
      <Text style={[styles.label, { color: colors.foreground }]}>{FIELD_LABELS[field]}</Text>
      {children}
      {prefilled.has(field) ? (
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>{PREFILL_CAPTION}</Text>
      ) : null}
    </View>
  );
}

export function OptionPills<T>({
  options,
  value,
  onSelect,
}: {
  readonly options: readonly Choice<T>[];
  readonly value: T;
  readonly onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.pills}>
      {options.map((option) => (
        <Pill
          key={String(option.value)}
          label={option.label}
          selected={option.value === value}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

export function MultiPills<T>({
  options,
  values,
  onToggle,
}: {
  readonly options: readonly Choice<T>[];
  readonly values: readonly T[];
  readonly onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.pills}>
      {options.map((option) => (
        <Pill
          key={String(option.value)}
          label={option.label}
          selected={values.includes(option.value)}
          onPress={() => onToggle(option.value)}
        />
      ))}
    </View>
  );
}

export function NumberField({
  field,
  value,
  onChange,
}: {
  readonly field: ProfileField;
  readonly value: string;
  readonly onChange: (text: string) => void;
}) {
  const { colors } = useTheme();
  const unit = UNITS[field];

  return (
    <View style={[styles.input, { backgroundColor: colors.muted }]}>
      <TextInput
        accessibilityLabel={FIELD_LABELS[field]}
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
        placeholder="—"
        placeholderTextColor={colors.mutedForeground}
        style={[styles.inputText, { color: colors.foreground }]}
      />
      {unit ? <Text style={[styles.unit, { color: colors.mutedForeground }]}>{unit}</Text> : null}
    </View>
  );
}

export function NotesField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (text: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View>
      <TextInput
        accessibilityLabel={FIELD_LABELS.notes}
        multiline
        maxLength={NOTES_MAX_CHARACTERS}
        value={value}
        onChangeText={onChange}
        placeholder={NOTES_PLACEHOLDER}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.notes,
          { backgroundColor: colors.muted, color: colors.foreground },
        ]}
      />
      <Text style={[styles.counter, { color: colors.mutedForeground }]}>
        {`${value.length} / ${NOTES_MAX_CHARACTERS}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  question: {
    gap: 10,
    marginBottom: 28,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: 8,
    minHeight: TAP_TARGET,
    minWidth: 132,
    paddingHorizontal: 14,
  },
  inputText: {
    flex: 1,
    fontSize: 17,
    minHeight: TAP_TARGET,
  },
  unit: {
    fontSize: 15,
  },
  notes: {
    borderRadius: Radius.md,
    fontSize: 16,
    lineHeight: 22,
    minHeight: NOTES_MIN_HEIGHT,
    padding: 14,
    textAlignVertical: 'top',
  },
  counter: {
    fontSize: 12,
    paddingTop: 6,
    textAlign: 'right',
  },
});
