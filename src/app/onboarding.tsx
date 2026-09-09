import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, Spacing } from '@/constants/theme';
import {
  DAYS_PER_WEEK_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVELS,
  FREE_TEXT_MAX_LENGTH,
  TRAINING_GOALS,
  draftFrom,
  toAnswers,
  type Equipment,
  type ExperienceLevel,
  type TrainingGoal,
} from '@/features/onboarding/answers';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useTheme } from '@/hooks/use-theme';

const GOAL_LABELS: Record<TrainingGoal, string> = {
  size: 'Size',
  strength: 'Strength',
  both: 'Both',
};

const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  'full-gym': 'Full gym',
  'home-gym': 'Home gym',
  minimal: 'Minimal',
};

const MIN_TAP_TARGET = 44;
const NOTES_MIN_HEIGHT = 88;

/**
 * The five questions, and the coaching note. Nothing here asks what the Hevy history answers —
 * lifts, volume and the frequency actually trained are read, never typed.
 *
 * The same screen is the first-run flow and the Settings editor. It opens on whatever was saved,
 * so editing never means answering again.
 */
export default function OnboardingScreen() {
  const saveOnboarding = useSettingsStore((state) => state.saveOnboarding);
  const [isEditing] = useState(() => useSettingsStore.getState().hasOnboarded);
  const [draft, setDraft] = useState(() => draftFrom(useSettingsStore.getState().onboardingAnswers));

  const answers = toAnswers(draft);

  const save = () => {
    if (answers === null) {
      return;
    }
    saveOnboarding(answers);
    if (isEditing) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <ThemedView style={Screen.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={Screen.scrollContent}>
        <Choice
          question="What are you training for?"
          options={TRAINING_GOALS}
          selected={draft.goal}
          describe={(goal) => GOAL_LABELS[goal]}
          onSelect={(goal) => setDraft({ ...draft, goal })}
        />
        <Choice
          question="How many days a week can you train?"
          options={DAYS_PER_WEEK_OPTIONS}
          selected={draft.daysPerWeek}
          describe={(days) => String(days)}
          onSelect={(daysPerWeek) => setDraft({ ...draft, daysPerWeek })}
        />
        <Choice
          question="How long have you been lifting?"
          options={EXPERIENCE_LEVELS}
          selected={draft.experience}
          describe={(experience) => EXPERIENCE_LABELS[experience]}
          onSelect={(experience) => setDraft({ ...draft, experience })}
        />
        <Choice
          question="What equipment do you have?"
          options={EQUIPMENT_OPTIONS}
          selected={draft.equipment}
          describe={(equipment) => EQUIPMENT_LABELS[equipment]}
          onSelect={(equipment) => setDraft({ ...draft, equipment })}
        />

        <FreeText
          question="Injuries or constraints?"
          value={draft.constraints}
          onChangeText={(constraints) => setDraft({ ...draft, constraints })}
          placeholder="Anything the coach must work around. Optional."
        />
        <FreeText
          question="Coaching notes"
          value={draft.coachingNotes}
          onChangeText={(coachingNotes) => setDraft({ ...draft, coachingNotes })}
          placeholder="Anything else you want the coach to know. Optional."
        />

        <Button title={isEditing ? 'Save' : 'Start'} onPress={save} disabled={answers === null} />
      </ScrollView>
    </ThemedView>
  );
}

type ChoiceProps<Option extends string | number> = {
  readonly question: string;
  readonly options: readonly Option[];
  readonly selected: Option | null;
  readonly describe: (option: Option) => string;
  readonly onSelect: (option: Option) => void;
};

function Choice<Option extends string | number>({
  question,
  options,
  selected,
  describe,
  onSelect,
}: ChoiceProps<Option>) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText>{question}</ThemedText>
      <View style={styles.options}>
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: option === selected }}
            onPress={() => onSelect(option)}
            style={[
              styles.option,
              option === selected ? { backgroundColor: theme.backgroundSelected } : null,
            ]}
          >
            <ThemedText>{describe(option)}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type FreeTextProps = {
  readonly question: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onChangeText: (value: string) => void;
};

function FreeText({ question, value, placeholder, onChangeText }: FreeTextProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText>{question}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        maxLength={FREE_TEXT_MAX_LENGTH}
        multiline
        style={[styles.notes, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    minHeight: MIN_TAP_TARGET,
    minWidth: MIN_TAP_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  notes: {
    minHeight: NOTES_MIN_HEIGHT,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
});
