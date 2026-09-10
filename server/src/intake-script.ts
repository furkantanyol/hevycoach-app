/**
 * The scripted intake as the athlete sees it: the question at each step, the pills under it, and how a
 * multi-answer loop narrows as they pick. `intake.ts` walks these; `intake-answer.ts` reads the replies.
 */
import { DAYS_PER_WEEK, DONE, NOTHING } from './intake-answer.js';
import type { Choice, Equipment, Goal, Injury, IntakePath, IntakeStep, MessageInput, Profile, YearsTraining } from './state.js';

export const ANYTHING_ELSE = 'Anything else?';

/** A question with `input` asks for a number instead of offering pills. */
export interface Question {
  step: IntakeStep;
  text: string;
  choices: Choice[];
  input?: MessageInput;
}

export type LoopStep = 'goals' | 'injuries';

const BODYWEIGHT_INPUT: MessageInput = { kind: 'bodyweight', unit: 'kg' };

/** The pills for one step: the value the app sends back, in the words the athlete reads. */
const pills = (labels: Record<string, string>): Choice[] =>
  Object.entries(labels).map(([value, label]) => ({ label, value }));

const PATH_CHOICES = pills({ new: 'New to Hevy', existing: 'Been logging' } satisfies Record<IntakePath, string>);

const YEAR_CHOICES = pills({ '<1': 'Less than a year', '1-3': '1 to 3 years', '3-5': '3 to 5 years', '5+': '5 years or more' } satisfies Record<YearsTraining, string>);

const EQUIPMENT_CHOICES = pills({
  full_gym: 'Full gym',
  home_gym: 'Home gym',
  dumbbells: 'Dumbbells only',
  bodyweight: 'Bodyweight only',
} satisfies Record<Equipment, string>);

const GOAL_CHOICES = pills({
  muscle: 'Muscle',
  strength: 'Strength',
  fat_loss: 'Fat loss',
  longevity: 'Longevity',
  athletic: 'Athletic performance',
} satisfies Record<Goal, string>);

/** "Nothing" is offered on the first ask only: once something is named there is nothing left to clear. */
const INJURY_CHOICES = pills({
  knee: 'Knee',
  shoulder: 'Shoulder',
  lower_back: 'Lower back',
  elbow_wrist: 'Elbow or wrist',
  hip: 'Hip',
  other: 'Other',
  [NOTHING]: 'Nothing',
} satisfies Record<Injury | typeof NOTHING, string>);

const DAY_CHOICES: Choice[] = DAYS_PER_WEEK.map((days) => ({ label: String(days), value: String(days) }));

const DONE_CHOICE: Choice = { label: "No, that's it", value: DONE };

/** The bodyweight confirmation is not here: it is rebuilt from the history, which holds its number. */
export const QUESTIONS: Record<Exclude<IntakeStep, 'bodyweight'>, Question> = {
  start: { step: 'start', text: 'New to Hevy, or been logging for a while?', choices: PATH_CHOICES },
  yearsTraining: { step: 'yearsTraining', text: 'How long have you been training?', choices: YEAR_CHOICES },
  daysPerWeek: { step: 'daysPerWeek', text: 'How many days a week?', choices: DAY_CHOICES },
  equipment: { step: 'equipment', text: 'What do you train with?', choices: EQUIPMENT_CHOICES },
  goals: { step: 'goals', text: 'What are you training for?', choices: GOAL_CHOICES },
  injuries: { step: 'injuries', text: 'Anything to work around?', choices: INJURY_CHOICES },
  bodyweightValue: { step: 'bodyweightValue', text: 'What is it now?', choices: [], input: BODYWEIGHT_INPUT },
};

/** Asked in place of the confirmation when there is no measurement to confirm. */
export const WEIGH_QUESTION: Question = { step: 'bodyweightValue', text: 'What do you weigh, in kilograms?', choices: [], input: BODYWEIGHT_INPUT };

export const isLoopStep = (step: IntakeStep): step is LoopStep => step === 'goals' || step === 'injuries';

export const chosen = (step: LoopStep, answers: Partial<Profile>): readonly string[] =>
  (step === 'goals' ? answers.goals : answers.injuries) ?? [];

/** The first ask offers everything; every later ask drops what they picked and offers the way out. */
export function loopQuestion(step: LoopStep, answers: Partial<Profile>): Question {
  const question = QUESTIONS[step];
  const picked = chosen(step, answers);
  if (picked.length === 0) return question;
  const left = question.choices.filter((choice) => choice.value !== NOTHING && !picked.includes(choice.value));
  return { step, text: ANYTHING_ELSE, choices: [...left, DONE_CHOICE] };
}

/** "Muscle, noted." names what this answer added, in the words the pills use. */
export function labelsOf(step: LoopStep, values: readonly string[]): string {
  const { choices } = QUESTIONS[step];
  return values.map((value) => choices.find((choice) => choice.value === value)?.label ?? value).join(', ');
}
