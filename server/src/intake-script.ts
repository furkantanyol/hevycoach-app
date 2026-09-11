/**
 * The scripted intake as the athlete sees it: the question at each step and the pills under it.
 * `intake.ts` walks these; `intake-answer.ts` reads the replies.
 */
import { DAYS_PER_WEEK, NOTHING } from './intake-answer.js';
import type { Choice, Equipment, Goal, Injury, IntakePath, IntakeStep, YearsTraining } from './state.js';

/** A question with no pills is answered in the composer; a `multi` question's pills are picked together and sent as one list. */
export interface Question {
  step: IntakeStep;
  text: string;
  choices: Choice[];
  multi?: true;
}

/** The pills for one step: the value the app sends back, in the words the athlete reads. */
const pills = (labels: Record<string, string>): Choice[] =>
  Object.entries(labels).map(([value, label]) => ({ label, value }));

/**
 * The two ways on from a history: a fresh block (the existing script, which still reads years and
 * equipment off Hevy) or one that builds on the routines they run. "Start new" is not the new-to-Hevy
 * path — a thin history alone chooses that one, before any question.
 */
const JOURNEY_CHOICES = pills({ existing: 'Start new', continue: 'Continue' } satisfies Partial<Record<IntakePath, string>>);

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

/** "Nothing" answers on its own: the app sends it at once, and it clears whatever else was picked. */
const INJURY_CHOICES: Choice[] = [
  ...pills({
    knee: 'Knee',
    shoulder: 'Shoulder',
    lower_back: 'Lower back',
    elbow_wrist: 'Elbow or wrist',
    hip: 'Hip',
    other: 'Other',
  } satisfies Record<Injury, string>),
  { label: 'Nothing', value: NOTHING, exclusive: true },
];

const DAY_CHOICES: Choice[] = DAYS_PER_WEEK.map((days) => ({ label: String(days), value: String(days) }));

/** The bodyweight confirmation is not here: it is rebuilt from the history, which holds its number. */
export const QUESTIONS: Record<Exclude<IntakeStep, 'bodyweight'>, Question> = {
  journey: {
    step: 'journey',
    text: "Start a new journey, or continue the one you're on? I'll review it and build from there.",
    choices: JOURNEY_CHOICES,
  },
  yearsTraining: { step: 'yearsTraining', text: 'How long have you been training?', choices: YEAR_CHOICES },
  daysPerWeek: { step: 'daysPerWeek', text: 'How many days a week?', choices: DAY_CHOICES },
  equipment: { step: 'equipment', text: 'What do you train with?', choices: EQUIPMENT_CHOICES },
  goals: { step: 'goals', text: 'What are you training for?', choices: GOAL_CHOICES, multi: true },
  injuries: { step: 'injuries', text: 'Anything to work around?', choices: INJURY_CHOICES, multi: true },
  bodyweightValue: { step: 'bodyweightValue', text: 'What is it now, in kilograms?', choices: [] },
  notes: { step: 'notes', text: 'Anything else I should know before I write your block?', choices: pills({ [NOTHING]: 'Nothing to add' }) },
};

/** Asked in place of the confirmation when there is no measurement to confirm. */
export const WEIGH_QUESTION: Question = { step: 'bodyweightValue', text: 'What do you weigh, in kilograms?', choices: [] };
