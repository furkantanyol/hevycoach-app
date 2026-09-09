import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Rule } from '@/components/motion';
import { RuledButton } from '@/components/ruled-button';
import { Stamp } from '@/components/stamp';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Figures, Screen, Spacing } from '@/constants/theme';
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
const BOX_SIZE = 16;

/**
 * The five questions, and the coaching note, printed as a form on the sheet: each field stamped,
 * ruled, and answered by ticking a box. It is one page rather than a wizard, because five
 * questions do not need paging and progress dots would be a ceremony the answers do not deserve.
 *
 * Nothing here asks what the Hevy history answers — lifts, volume and the frequency actually
 * trained are read, never typed. The same screen is the first-run flow and the Settings editor, so
 * it opens on whatever was saved and editing never means answering again.
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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={Screen.scrollContent}
        keyboardDismissMode="on-drag"
      >
        <Choice
          field="Goal"
          question="What are you training for?"
          options={TRAINING_GOALS}
          selected={draft.goal}
          describe={(goal) => GOAL_LABELS[goal]}
          onSelect={(goal) => setDraft({ ...draft, goal })}
        />
        <Choice
          field="Days per week"
          question="How many days a week can you train?"
          options={DAYS_PER_WEEK_OPTIONS}
          selected={draft.daysPerWeek}
          describe={(days) => String(days)}
          onSelect={(daysPerWeek) => setDraft({ ...draft, daysPerWeek })}
        />
        <Choice
          field="Experience"
          question="How long have you been lifting?"
          options={EXPERIENCE_LEVELS}
          selected={draft.experience}
          describe={(experience) => EXPERIENCE_LABELS[experience]}
          onSelect={(experience) => setDraft({ ...draft, experience })}
        />
        <Choice
          field="Equipment"
          question="What equipment do you have?"
          options={EQUIPMENT_OPTIONS}
          selected={draft.equipment}
          describe={(equipment) => EQUIPMENT_LABELS[equipment]}
          onSelect={(equipment) => setDraft({ ...draft, equipment })}
        />

        <FreeText
          field="Constraints"
          question="Injuries or constraints?"
          value={draft.constraints}
          onChangeText={(constraints) => setDraft({ ...draft, constraints })}
          placeholder="Anything the coach must work around. Optional."
        />
        <FreeText
          field="Coaching notes"
          question="Anything else the coach should know?"
          value={draft.coachingNotes}
          onChangeText={(coachingNotes) => setDraft({ ...draft, coachingNotes })}
          placeholder="Optional."
        />

        <View style={styles.submit}>
          <RuledButton
            title={isEditing ? 'Save' : 'Start'}
            onPress={save}
            primary
            disabled={answers === null}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/** A stamped field name over the question it asks, and the ink rule its answers hang from. */
function FieldHead({ field, question }: { field: string; question: string }) {
  return (
    <View style={styles.head}>
      <Stamp>{field}</Stamp>
      <ThemedText>{question}</ThemedText>
      <Rule weight="ink" />
    </View>
  );
}

type ChoiceProps<Option extends string | number> = {
  readonly field: string;
  readonly question: string;
  readonly options: readonly Option[];
  readonly selected: Option | null;
  readonly describe: (option: Option) => string;
  readonly onSelect: (option: Option) => void;
};

function Choice<Option extends string | number>({
  field,
  question,
  options,
  selected,
  describe,
  onSelect,
}: ChoiceProps<Option>) {
  return (
    <View>
      <FieldHead field={field} question={question} />
      {options.map((option) => (
        <OptionRow
          key={option}
          label={describe(option)}
          selected={option === selected}
          onPress={() => onSelect(option)}
        />
      ))}
    </View>
  );
}

type OptionRowProps = {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
};

/** One ruled line of the form, answered by filling in its box. */
function OptionRow({ label, selected, onPress }: OptionRowProps) {
  const theme = useTheme();

  return (
    <View>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={styles.option}
      >
        <ThemedText style={Figures.tabular}>{label}</ThemedText>
        <View
          style={[
            styles.box,
            { borderColor: theme.ink, backgroundColor: selected ? theme.ink : 'transparent' },
          ]}
        />
      </Pressable>
      <Rule />
    </View>
  );
}

type FreeTextProps = {
  readonly field: string;
  readonly question: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onChangeText: (value: string) => void;
};

function FreeText({ field, question, value, placeholder, onChangeText }: FreeTextProps) {
  const theme = useTheme();

  return (
    <View>
      <FieldHead field={field} question={question} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.inkSecondary}
        maxLength={FREE_TEXT_MAX_LENGTH}
        multiline
        style={[styles.notes, { color: theme.ink }]}
      />
      <Rule />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  option: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notes: {
    minHeight: NOTES_MIN_HEIGHT,
    paddingVertical: Spacing.two,
  },
  submit: {
    paddingTop: Spacing.two,
  },
});
