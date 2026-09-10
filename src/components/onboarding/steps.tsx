/**
 * The five question steps of `ONBOARDING_STEPS`, one component each, reading
 * and writing the module-level draft. Nothing here validates: `isStepComplete`
 * owns that, and the footer reads it.
 */
import { updateDraft, useDraft } from '../../lib/onboarding-draft';
import {
  CARDIO_OPTIONS,
  EQUIPMENT_OPTIONS,
  GOAL_OPTIONS,
  INJURY_OPTIONS,
  SEX_OPTIONS,
  TRAINING_STYLE_OPTIONS,
  YEARS_TRAINING_OPTIONS,
} from '../../lib/options';
import { MultiPills, NotesField, NumberField, OptionPills, Question, type Choice } from './fields';

const MINUTES_SUFFIX = ' min';
/** Hevy's own session lengths, inside the server's 20-180 bounds. */
const SESSION_MINUTES = [30, 45, 60, 75, 90, 120];
const MAX_DAYS_PER_WEEK = 7;

const DAY_OPTIONS: readonly Choice<number>[] = Array.from(
  { length: MAX_DAYS_PER_WEEK },
  (_unused, index) => ({ value: index + 1, label: String(index + 1) }),
);

/** A prefilled length the pills do not list still has to be selectable. */
function minuteOptions(current: number | null): readonly Choice<number>[] {
  const values =
    current !== null && !SESSION_MINUTES.includes(current)
      ? [...SESSION_MINUTES, current].sort((first, second) => first - second)
      : SESSION_MINUTES;
  return values.map((value) => ({ value, label: `${value}${MINUTES_SUFFIX}` }));
}

/** Multi-select: tapping a chosen pill drops it, tapping any other adds it to the end. */
function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((current) => current !== value) : [...values, value];
}

function AboutYou() {
  const draft = useDraft();
  return (
    <>
      <Question field="sex">
        <OptionPills
          options={SEX_OPTIONS}
          value={draft.sex}
          onSelect={(sex) => updateDraft({ sex })}
        />
      </Question>
      <Question field="age">
        <NumberField field="age" value={draft.age} onChange={(age) => updateDraft({ age })} />
      </Question>
      <Question field="heightCm">
        <NumberField
          field="heightCm"
          value={draft.heightCm}
          onChange={(heightCm) => updateDraft({ heightCm })}
        />
      </Question>
    </>
  );
}

function Goals() {
  const draft = useDraft();
  return (
    <Question field="goals">
      <MultiPills
        options={GOAL_OPTIONS}
        values={draft.goals}
        onToggle={(goal) => updateDraft({ goals: toggled(draft.goals, goal) })}
      />
    </Question>
  );
}

function Training() {
  const draft = useDraft();
  return (
    <>
      <Question field="daysPerWeek">
        <OptionPills
          options={DAY_OPTIONS}
          value={draft.daysPerWeek}
          onSelect={(daysPerWeek) => updateDraft({ daysPerWeek })}
        />
      </Question>
      <Question field="sessionMinutes">
        <OptionPills
          options={minuteOptions(draft.sessionMinutes)}
          value={draft.sessionMinutes}
          onSelect={(sessionMinutes) => updateDraft({ sessionMinutes })}
        />
      </Question>
      <Question field="yearsTraining">
        <OptionPills
          options={YEARS_TRAINING_OPTIONS}
          value={draft.yearsTraining}
          onSelect={(yearsTraining) => updateDraft({ yearsTraining })}
        />
      </Question>
    </>
  );
}

function EquipmentAndStyle() {
  const draft = useDraft();
  return (
    <>
      <Question field="equipment">
        <OptionPills
          options={EQUIPMENT_OPTIONS}
          value={draft.equipment}
          onSelect={(equipment) => updateDraft({ equipment })}
        />
      </Question>
      <Question field="trainingStyle">
        <OptionPills
          options={TRAINING_STYLE_OPTIONS}
          value={draft.trainingStyle}
          onSelect={(trainingStyle) => updateDraft({ trainingStyle })}
        />
      </Question>
      <Question field="cardio">
        <OptionPills
          options={CARDIO_OPTIONS}
          value={draft.cardio}
          onSelect={(cardio) => updateDraft({ cardio })}
        />
      </Question>
    </>
  );
}

function BodyAndLimits() {
  const draft = useDraft();
  return (
    <>
      <Question field="bodyweightKg">
        <NumberField
          field="bodyweightKg"
          value={draft.bodyweightKg}
          onChange={(bodyweightKg) => updateDraft({ bodyweightKg })}
        />
      </Question>
      <Question field="injuries">
        <MultiPills
          options={INJURY_OPTIONS}
          values={draft.injuries}
          onToggle={(injury) => updateDraft({ injuries: toggled(draft.injuries, injury) })}
        />
      </Question>
      <Question field="notes">
        <NotesField value={draft.notes} onChange={(notes) => updateDraft({ notes })} />
      </Question>
    </>
  );
}

const STEP_BODIES: Readonly<Record<number, () => React.JSX.Element>> = {
  1: AboutYou,
  2: Goals,
  3: Training,
  4: EquipmentAndStyle,
  5: BodyAndLimits,
};

/** The questions of one step, or nothing when the step asks none (Review). */
export function StepQuestions({ step }: { readonly step: number }) {
  const Body = STEP_BODIES[step];
  if (!Body) return null;
  return <Body />;
}
