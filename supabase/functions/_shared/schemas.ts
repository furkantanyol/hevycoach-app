/**
 * Request and response contracts for the coach routes, with runtime validators.
 *
 * The response validator is the guard that keeps the product's first principle
 * true: the model proposes block structure and exercise selection, and nothing
 * else. Unknown keys are rejected rather than ignored, so a model that invents
 * a `sets`, `reps` or `weightKg` field fails validation instead of having it
 * quietly dropped on the way to a device that would then have nowhere to put it.
 */

export type Validated<T> = { readonly ok: true; readonly value: T } | {
  readonly ok: false;
  readonly error: string;
};

export type Goal = 'size' | 'strength' | 'both';
export type ExerciseRole = 'primary' | 'secondary' | 'accessory';
export type ExplainSubject = 'decision' | 'block';

const GOALS: readonly string[] = ['size', 'strength', 'both'];
const ROLES: readonly string[] = ['primary', 'secondary', 'accessory'];
const SUBJECTS: readonly string[] = ['decision', 'block'];

const MIN_DAYS_PER_WEEK = 1;
const MAX_DAYS_PER_WEEK = 7;
const MAX_SHORT_TEXT = 200;
const MAX_NOTES_LENGTH = 2_000;
const MAX_SUMMARY_LENGTH = 20_000;
const MAX_TEMPLATES = 500;
const MAX_SESSIONS = 14;
const MAX_EXERCISES_PER_SESSION = 20;
const MIN_BLOCK_WEEKS = 1;
const MAX_BLOCK_WEEKS = 12;
const MAX_RATIONALE_LENGTH = 4_000;
const MAX_EXPLANATION_LENGTH = 4_000;

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

export interface ProgramBlock {
  readonly name: string;
  readonly weeks: number;
  readonly sessionsPerWeek: number;
}

export interface ProgramExercise {
  readonly exerciseTemplateId: string;
  readonly role: ExerciseRole;
}

export interface ProgramSession {
  readonly name: string;
  readonly focus: string;
  readonly exercises: readonly ProgramExercise[];
}

export interface ProgramResponse {
  readonly block: ProgramBlock;
  readonly sessions: readonly ProgramSession[];
  readonly rationale: string;
}

export interface ExplainRequest {
  readonly subject: ExplainSubject;
  readonly context: string;
  readonly question?: string;
}

export interface ExplainResponse {
  readonly explanation: string;
}

function invalid<T>(error: string): Validated<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedKey(
  record: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): string | null {
  return Object.keys(record).find((key) => !allowed.includes(key)) ?? null;
}

function readText(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maxLength: number,
): Validated<string> {
  const value = record[key];
  if (typeof value !== 'string') {
    return invalid(`${key} must be a string`);
  }
  if (value.length > maxLength) {
    return invalid(`${key} must be at most ${maxLength} characters`);
  }
  return { ok: true, value };
}

function readInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  bounds: { readonly min: number; readonly max: number },
): Validated<number> {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return invalid(`${key} must be an integer`);
  }
  if (value < bounds.min || value > bounds.max) {
    return invalid(`${key} must be between ${bounds.min} and ${bounds.max}`);
  }
  return { ok: true, value };
}

function readEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  allowed: readonly string[],
): Validated<T> {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return invalid(`${key} must be one of ${allowed.join(', ')}`);
  }
  return { ok: true, value: value as T };
}

function readArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  maxLength: number,
): Validated<readonly unknown[]> {
  const value = record[key];
  if (!Array.isArray(value)) {
    return invalid(`${key} must be an array`);
  }
  if (value.length === 0) {
    return invalid(`${key} must not be empty`);
  }
  if (value.length > maxLength) {
    return invalid(`${key} must hold at most ${maxLength} entries`);
  }
  return { ok: true, value };
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
  const id = readText(value, 'id', MAX_SHORT_TEXT);
  if (!id.ok) return id;
  if (id.value.length === 0) {
    return invalid('template id must not be empty');
  }
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

const BLOCK_KEYS = ['name', 'weeks', 'sessionsPerWeek'];
const SESSION_KEYS = ['name', 'focus', 'exercises'];
const EXERCISE_KEYS = ['exerciseTemplateId', 'role'];

function parseBlock(value: unknown): Validated<ProgramBlock> {
  if (!isRecord(value)) {
    return invalid('block must be an object');
  }
  const extra = unexpectedKey(value, BLOCK_KEYS);
  if (extra !== null) {
    return invalid(`block has unexpected field ${extra}`);
  }
  const name = readText(value, 'name', MAX_SHORT_TEXT);
  if (!name.ok) return name;
  const weeks = readInteger(value, 'weeks', { min: MIN_BLOCK_WEEKS, max: MAX_BLOCK_WEEKS });
  if (!weeks.ok) return weeks;
  const sessionsPerWeek = readInteger(value, 'sessionsPerWeek', {
    min: MIN_DAYS_PER_WEEK,
    max: MAX_DAYS_PER_WEEK,
  });
  if (!sessionsPerWeek.ok) return sessionsPerWeek;
  return {
    ok: true,
    value: { name: name.value, weeks: weeks.value, sessionsPerWeek: sessionsPerWeek.value },
  };
}

function parseExercise(
  value: unknown,
  knownTemplateIds: ReadonlySet<string>,
): Validated<ProgramExercise> {
  if (!isRecord(value)) {
    return invalid('each exercise must be an object');
  }
  const extra = unexpectedKey(value, EXERCISE_KEYS);
  if (extra !== null) {
    return invalid(`exercise has unexpected field ${extra}`);
  }
  const exerciseTemplateId = readText(value, 'exerciseTemplateId', MAX_SHORT_TEXT);
  if (!exerciseTemplateId.ok) return exerciseTemplateId;
  if (!knownTemplateIds.has(exerciseTemplateId.value)) {
    return invalid(`exerciseTemplateId ${exerciseTemplateId.value} was not offered to the model`);
  }
  const role = readEnum<ExerciseRole>(value, 'role', ROLES);
  if (!role.ok) return role;
  return { ok: true, value: { exerciseTemplateId: exerciseTemplateId.value, role: role.value } };
}

function parseSession(
  value: unknown,
  knownTemplateIds: ReadonlySet<string>,
): Validated<ProgramSession> {
  if (!isRecord(value)) {
    return invalid('each session must be an object');
  }
  const extra = unexpectedKey(value, SESSION_KEYS);
  if (extra !== null) {
    return invalid(`session has unexpected field ${extra}`);
  }
  const name = readText(value, 'name', MAX_SHORT_TEXT);
  if (!name.ok) return name;
  const focus = readText(value, 'focus', MAX_SHORT_TEXT);
  if (!focus.ok) return focus;
  const exerciseValues = readArray(value, 'exercises', MAX_EXERCISES_PER_SESSION);
  if (!exerciseValues.ok) return exerciseValues;

  const exercises: ProgramExercise[] = [];
  for (const candidate of exerciseValues.value) {
    const exercise = parseExercise(candidate, knownTemplateIds);
    if (!exercise.ok) return exercise;
    exercises.push(exercise.value);
  }
  return { ok: true, value: { name: name.value, focus: focus.value, exercises } };
}

const PROGRAM_RESPONSE_KEYS = ['block', 'sessions', 'rationale'];

/**
 * Validates what the model returned against the offered template library.
 *
 * A hallucinated `exerciseTemplateId` is the failure mode that matters: it
 * would be written into a Hevy routine as an exercise that does not exist. Any
 * id the request did not supply rejects the whole response.
 */
export function parseProgramResponse(
  value: unknown,
  knownTemplateIds: ReadonlySet<string>,
): Validated<ProgramResponse> {
  if (!isRecord(value)) {
    return invalid('response must be an object');
  }
  const extra = unexpectedKey(value, PROGRAM_RESPONSE_KEYS);
  if (extra !== null) {
    return invalid(`response has unexpected field ${extra}`);
  }
  const block = parseBlock(value.block);
  if (!block.ok) return block;
  const sessionValues = readArray(value, 'sessions', MAX_SESSIONS);
  if (!sessionValues.ok) return sessionValues;

  const sessions: ProgramSession[] = [];
  for (const candidate of sessionValues.value) {
    const session = parseSession(candidate, knownTemplateIds);
    if (!session.ok) return session;
    sessions.push(session.value);
  }
  const rationale = readText(value, 'rationale', MAX_RATIONALE_LENGTH);
  if (!rationale.ok) return rationale;
  return { ok: true, value: { block: block.value, sessions, rationale: rationale.value } };
}

export function parseExplainResponse(value: unknown): Validated<ExplainResponse> {
  if (!isRecord(value)) {
    return invalid('response must be an object');
  }
  const extra = unexpectedKey(value, ['explanation']);
  if (extra !== null) {
    return invalid(`response has unexpected field ${extra}`);
  }
  const explanation = readText(value, 'explanation', MAX_EXPLANATION_LENGTH);
  if (!explanation.ok) return explanation;
  return { ok: true, value: { explanation: explanation.value } };
}

/**
 * The JSON schema handed to the model. It carries no weight, set count or rep
 * range, which is the point: the shape the model is allowed to return has
 * nowhere to put a number the rules engine owns.
 */
export const PROGRAM_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: {
    block: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        weeks: { type: 'integer', minimum: MIN_BLOCK_WEEKS, maximum: MAX_BLOCK_WEEKS },
        sessionsPerWeek: {
          type: 'integer',
          minimum: MIN_DAYS_PER_WEEK,
          maximum: MAX_DAYS_PER_WEEK,
        },
      },
      required: ['name', 'weeks', 'sessionsPerWeek'],
      additionalProperties: false,
    },
    sessions: {
      type: 'array',
      maxItems: MAX_SESSIONS,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          focus: { type: 'string' },
          exercises: {
            type: 'array',
            maxItems: MAX_EXERCISES_PER_SESSION,
            items: {
              type: 'object',
              properties: {
                exerciseTemplateId: { type: 'string' },
                role: { type: 'string', enum: ROLES },
              },
              required: ['exerciseTemplateId', 'role'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'focus', 'exercises'],
        additionalProperties: false,
      },
    },
    rationale: { type: 'string' },
  },
  required: ['block', 'sessions', 'rationale'],
  additionalProperties: false,
};

export const EXPLAIN_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: { explanation: { type: 'string' } },
  required: ['explanation'],
  additionalProperties: false,
};

export interface HevyWebhookEvent {
  readonly id: string;
  readonly workoutId: string;
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
  const id = readText(body, 'id', MAX_SHORT_TEXT);
  if (!id.ok) return id;
  if (id.value.length === 0) {
    return invalid('id must not be empty');
  }
  if (!isRecord(body.payload)) {
    return invalid('payload must be an object');
  }
  const payloadExtra = unexpectedKey(body.payload, WEBHOOK_PAYLOAD_KEYS);
  if (payloadExtra !== null) {
    return invalid(`payload has unexpected field ${payloadExtra}`);
  }
  const workoutId = readText(body.payload, 'workoutId', MAX_SHORT_TEXT);
  if (!workoutId.ok) return workoutId;
  if (workoutId.value.length === 0) {
    return invalid('workoutId must not be empty');
  }
  return { ok: true, value: { id: id.value, workoutId: workoutId.value } };
}
