import {
  invalid,
  isRecord,
  MAX_NOTES_LENGTH,
  MAX_SHORT_TEXT,
  MAX_SUMMARY_LENGTH,
  readArray,
  readEnum,
  readIdentifier,
  readInteger,
  readText,
  unexpectedKey,
  type Validated,
} from './validate.ts';

/**
 * What clients send us: the coach requests from the app, and the webhook body
 * from Hevy. What the model sends back is a separate boundary and lives in
 * model-output.ts.
 */

export type Goal = 'size' | 'strength' | 'both';
export type ExplainSubject = 'decision' | 'block';

const GOALS: readonly string[] = ['size', 'strength', 'both'];
const SUBJECTS: readonly string[] = ['decision', 'block'];

export const MIN_DAYS_PER_WEEK = 1;
export const MAX_DAYS_PER_WEEK = 7;

const MAX_TEMPLATES = 500;

export interface OnboardingAnswers {
  readonly goal: Goal;
  readonly daysPerWeek: number;
  readonly experience: string;
  readonly equipment: string;
  readonly constraints: string;
}

export interface ExerciseTemplateSummary {
  readonly id: string;
  readonly title: string;
  readonly primaryMuscleGroup: string;
  readonly equipment: string;
}

export interface ProgramRequest {
  readonly onboarding: OnboardingAnswers;
  readonly coachingNotes: string;
  readonly historySummary: string;
  readonly templates: readonly ExerciseTemplateSummary[];
}

export interface ExplainRequest {
  readonly subject: ExplainSubject;
  readonly context: string;
  readonly question?: string;
}

export interface HevyWebhookEvent {
  readonly id: string;
  readonly workoutId: string;
}

const ONBOARDING_KEYS = ['goal', 'daysPerWeek', 'experience', 'equipment', 'constraints'];

function parseOnboarding(value: unknown): Validated<OnboardingAnswers> {
  if (!isRecord(value)) {
    return invalid('onboarding must be an object');
  }
  const extra = unexpectedKey(value, ONBOARDING_KEYS);
  if (extra !== null) {
    return invalid(`onboarding has unexpected field ${extra}`);
  }
  const goal = readEnum<Goal>(value, 'goal', GOALS);
  if (!goal.ok) return goal;
  const daysPerWeek = readInteger(value, 'daysPerWeek', {
    min: MIN_DAYS_PER_WEEK,
    max: MAX_DAYS_PER_WEEK,
  });
  if (!daysPerWeek.ok) return daysPerWeek;
  const experience = readText(value, 'experience', MAX_SHORT_TEXT);
  if (!experience.ok) return experience;
  const equipment = readText(value, 'equipment', MAX_SHORT_TEXT);
  if (!equipment.ok) return equipment;
  const constraints = readText(value, 'constraints', MAX_NOTES_LENGTH);
  if (!constraints.ok) return constraints;
  return {
    ok: true,
    value: {
      goal: goal.value,
      daysPerWeek: daysPerWeek.value,
      experience: experience.value,
      equipment: equipment.value,
      constraints: constraints.value,
    },
  };
}

const TEMPLATE_KEYS = ['id', 'title', 'primaryMuscleGroup', 'equipment'];

function parseTemplate(value: unknown): Validated<ExerciseTemplateSummary> {
  if (!isRecord(value)) {
    return invalid('each template must be an object');
  }
  const extra = unexpectedKey(value, TEMPLATE_KEYS);
  if (extra !== null) {
    return invalid(`template has unexpected field ${extra}`);
  }
  const id = readIdentifier(value, 'id');
  if (!id.ok) return id;
  const title = readText(value, 'title', MAX_SHORT_TEXT);
  if (!title.ok) return title;
  const primaryMuscleGroup = readText(value, 'primaryMuscleGroup', MAX_SHORT_TEXT);
  if (!primaryMuscleGroup.ok) return primaryMuscleGroup;
  const equipment = readText(value, 'equipment', MAX_SHORT_TEXT);
  if (!equipment.ok) return equipment;
  return {
    ok: true,
    value: {
      id: id.value,
      title: title.value,
      primaryMuscleGroup: primaryMuscleGroup.value,
      equipment: equipment.value,
    },
  };
}

const PROGRAM_REQUEST_KEYS = ['onboarding', 'coachingNotes', 'historySummary', 'templates'];

export function parseProgramRequest(body: unknown): Validated<ProgramRequest> {
  if (!isRecord(body)) {
    return invalid('body must be an object');
  }
  const extra = unexpectedKey(body, PROGRAM_REQUEST_KEYS);
  if (extra !== null) {
    return invalid(`body has unexpected field ${extra}`);
  }
  const onboarding = parseOnboarding(body.onboarding);
  if (!onboarding.ok) return onboarding;
  const coachingNotes = readText(body, 'coachingNotes', MAX_NOTES_LENGTH);
  if (!coachingNotes.ok) return coachingNotes;
  const historySummary = readText(body, 'historySummary', MAX_SUMMARY_LENGTH);
  if (!historySummary.ok) return historySummary;
  const templateValues = readArray(body, 'templates', MAX_TEMPLATES);
  if (!templateValues.ok) return templateValues;

  const templates: ExerciseTemplateSummary[] = [];
  for (const candidate of templateValues.value) {
    const template = parseTemplate(candidate);
    if (!template.ok) return template;
    templates.push(template.value);
  }
  return {
    ok: true,
    value: {
      onboarding: onboarding.value,
      coachingNotes: coachingNotes.value,
      historySummary: historySummary.value,
      templates,
    },
  };
}

const EXPLAIN_REQUEST_KEYS = ['subject', 'context', 'question'];

export function parseExplainRequest(body: unknown): Validated<ExplainRequest> {
  if (!isRecord(body)) {
    return invalid('body must be an object');
  }
  const extra = unexpectedKey(body, EXPLAIN_REQUEST_KEYS);
  if (extra !== null) {
    return invalid(`body has unexpected field ${extra}`);
  }
  const subject = readEnum<ExplainSubject>(body, 'subject', SUBJECTS);
  if (!subject.ok) return subject;
  const context = readText(body, 'context', MAX_SUMMARY_LENGTH);
  if (!context.ok) return context;
  if (body.question === undefined) {
    return { ok: true, value: { subject: subject.value, context: context.value } };
  }
  const question = readText(body, 'question', MAX_NOTES_LENGTH);
  if (!question.ok) return question;
  return {
    ok: true,
    value: { subject: subject.value, context: context.value, question: question.value },
  };
}

const WEBHOOK_KEYS = ['id', 'payload'];
const WEBHOOK_PAYLOAD_KEYS = ['workoutId'];

export function parseHevyWebhookEvent(body: unknown): Validated<HevyWebhookEvent> {
  if (!isRecord(body)) {
    return invalid('body must be an object');
  }
  const extra = unexpectedKey(body, WEBHOOK_KEYS);
  if (extra !== null) {
    return invalid(`body has unexpected field ${extra}`);
  }
  const id = readIdentifier(body, 'id');
  if (!id.ok) return id;
  if (!isRecord(body.payload)) {
    return invalid('payload must be an object');
  }
  const payloadExtra = unexpectedKey(body.payload, WEBHOOK_PAYLOAD_KEYS);
  if (payloadExtra !== null) {
    return invalid(`payload has unexpected field ${payloadExtra}`);
  }
  const workoutId = readIdentifier(body.payload, 'workoutId');
  if (!workoutId.ok) return workoutId;
  return { ok: true, value: { id: id.value, workoutId: workoutId.value } };
}
