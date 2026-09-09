/**
 * The five onboarding questions and nothing else (PRODUCT.md). Anything the Hevy history already
 * answers — lifts, volume, frequency actually trained — is never asked.
 */

export const TRAINING_GOALS = ['size', 'strength', 'both'] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EQUIPMENT_OPTIONS = ['full-gym', 'home-gym', 'minimal'] as const;
export type Equipment = (typeof EQUIPMENT_OPTIONS)[number];

export const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const;
export type DaysPerWeek = (typeof DAYS_PER_WEEK_OPTIONS)[number];

/**
 * Both free-text fields reach the model as untrusted context wrapped in the server's delimiters
 * (ADR 0004). The cap is here so a paste of a whole document never becomes a request body.
 */
export const FREE_TEXT_MAX_LENGTH = 1000;

export type OnboardingAnswers = {
  readonly goal: TrainingGoal;
  readonly daysPerWeek: DaysPerWeek;
  readonly experience: ExperienceLevel;
  readonly equipment: Equipment;
  readonly constraints: string;
  readonly coachingNotes: string;
};

/** What the screen holds while the user is still answering. */
export type OnboardingDraft = {
  readonly goal: TrainingGoal | null;
  readonly daysPerWeek: DaysPerWeek | null;
  readonly experience: ExperienceLevel | null;
  readonly equipment: Equipment | null;
  readonly constraints: string;
  readonly coachingNotes: string;
};

export const EMPTY_DRAFT: OnboardingDraft = {
  goal: null,
  daysPerWeek: null,
  experience: null,
  equipment: null,
  constraints: '',
  coachingNotes: '',
};

/** Re-opening the flow from Settings starts from the saved answers, never from a blank form. */
export function draftFrom(answers: OnboardingAnswers | null): OnboardingDraft {
  return answers ?? EMPTY_DRAFT;
}

function cleaned(text: string): string {
  return text.trim().slice(0, FREE_TEXT_MAX_LENGTH);
}

/** `null` while a required choice is still missing, which is what disables Save. */
export function toAnswers(draft: OnboardingDraft): OnboardingAnswers | null {
  const { goal, daysPerWeek, experience, equipment } = draft;
  if (goal === null || daysPerWeek === null || experience === null || equipment === null) {
    return null;
  }

  return {
    goal,
    daysPerWeek,
    experience,
    equipment,
    constraints: cleaned(draft.constraints),
    coachingNotes: cleaned(draft.coachingNotes),
  };
}
