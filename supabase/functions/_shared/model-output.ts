import { MAX_DAYS_PER_WEEK, MIN_DAYS_PER_WEEK } from './schemas.ts';
import {
  invalid,
  isRecord,
  MAX_SHORT_TEXT,
  readArray,
  readEnum,
  readIdentifier,
  readInteger,
  readText,
  unexpectedKey,
  type Validated,
} from './validate.ts';

/**
 * The boundary that keeps every number computed rather than generated.
 *
 * The model proposes block structure and exercise selection. It has nowhere in
 * this shape to put a load, a set count or a rep range, and anything it invents
 * anyway — an unexpected field, or an exercise template id the request never
 * offered — rejects the whole response rather than travelling to a device.
 *
 * The free-text fields are the one place a number could still appear, so they
 * are scanned rather than trusted: a rationale reading "3 sets of 8" rejects the
 * response the same way an unoffered template id does.
 */

export type ExerciseRole = 'primary' | 'secondary' | 'accessory';

const ROLES: readonly string[] = ['primary', 'secondary', 'accessory'];

const MIN_BLOCK_WEEKS = 1;
const MAX_BLOCK_WEEKS = 12;
const MAX_SESSIONS = 14;
const MAX_EXERCISES_PER_SESSION = 20;
const MAX_PROSE_LENGTH = 4_000;

/**
 * Units and prescriptions the rules engine owns. A digit on either side of one
 * of these — "87.5kg", "RPE 8", "3 sets of 8", "5x5", "80%" — is a number the
 * model was told never to state.
 */
const UNIT_WORDS = 'kg|kgs|lb|lbs|pounds?|kilos?|reps?|sets?|rpe|rir';
const PRESCRIBED_NUMBER = new RegExp(
  [
    `\\d\\s*(?:${UNIT_WORDS})\\b`,
    `\\b(?:${UNIT_WORDS})\\s*\\d`,
    '\\d\\s*%',
    '\\d\\s*[x\u00d7]\\s*\\d',
  ].join('|'),
  'i',
);

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

export interface ExplainResponse {
  readonly explanation: string;
}

const BLOCK_KEYS = ['name', 'weeks', 'sessionsPerWeek'];
const SESSION_KEYS = ['name', 'focus', 'exercises'];
const EXERCISE_KEYS = ['exerciseTemplateId', 'role'];
const PROGRAM_RESPONSE_KEYS = ['block', 'sessions', 'rationale'];

/**
 * Reads a free-text field and rejects it if it states a number the deterministic
 * rules engine owns. The system prompt forbids those numbers; this is the part
 * that enforces it.
 */
function readProse(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Validated<string> {
  const text = readText(record, key, MAX_PROSE_LENGTH);
  if (!text.ok) return text;
  if (PRESCRIBED_NUMBER.test(text.value)) {
    return invalid(`${key} states a number the rules engine owns`);
  }
  return text;
}

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
  offeredTemplateIds: ReadonlySet<string>,
): Validated<ProgramExercise> {
  if (!isRecord(value)) {
    return invalid('each exercise must be an object');
  }
  const extra = unexpectedKey(value, EXERCISE_KEYS);
  if (extra !== null) {
    return invalid(`exercise has unexpected field ${extra}`);
  }
  const exerciseTemplateId = readIdentifier(value, 'exerciseTemplateId');
  if (!exerciseTemplateId.ok) return exerciseTemplateId;
  if (!offeredTemplateIds.has(exerciseTemplateId.value)) {
    return invalid(`exerciseTemplateId ${exerciseTemplateId.value} was not offered to the model`);
  }
  const role = readEnum<ExerciseRole>(value, 'role', ROLES);
  if (!role.ok) return role;
  return { ok: true, value: { exerciseTemplateId: exerciseTemplateId.value, role: role.value } };
}

function parseSession(
  value: unknown,
  offeredTemplateIds: ReadonlySet<string>,
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
    const exercise = parseExercise(candidate, offeredTemplateIds);
    if (!exercise.ok) return exercise;
    exercises.push(exercise.value);
  }
  return { ok: true, value: { name: name.value, focus: focus.value, exercises } };
}

/**
 * The ordered exercise ids are what make a session distinct to the rules
 * engine — two sessions with the same ids in the same order collide into one
 * training day even if the model gave them different names or focus text.
 */
function sessionExerciseSignature(session: ProgramSession): string {
  return JSON.stringify(session.exercises.map((exercise) => exercise.exerciseTemplateId));
}

function findDuplicateSessionName(sessions: readonly ProgramSession[]): string | null {
  const seenSignatures = new Set<string>();
  for (const session of sessions) {
    const signature = sessionExerciseSignature(session);
    if (seenSignatures.has(signature)) {
      return session.name;
    }
    seenSignatures.add(signature);
  }
  return null;
}

export function parseProgramResponse(
  value: unknown,
  offeredTemplateIds: ReadonlySet<string>,
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
  if (sessionValues.value.length !== block.value.sessionsPerWeek) {
    return invalid(
      `sessions has ${sessionValues.value.length} entries but block.sessionsPerWeek is ${block.value.sessionsPerWeek}`,
    );
  }

  const sessions: ProgramSession[] = [];
  for (const candidate of sessionValues.value) {
    const session = parseSession(candidate, offeredTemplateIds);
    if (!session.ok) return session;
    sessions.push(session.value);
  }
  const duplicateSessionName = findDuplicateSessionName(sessions);
  if (duplicateSessionName !== null) {
    return invalid(`session "${duplicateSessionName}" duplicates another session's exercises`);
  }
  const rationale = readProse(value, 'rationale');
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
  const explanation = readProse(value, 'explanation');
  if (!explanation.ok) return explanation;
  return { ok: true, value: { explanation: explanation.value } };
}

/**
 * The schema handed to the model. It carries no weight, set count or rep range,
 * which is the point: the shape the model is allowed to return has nowhere to
 * put a number the rules engine owns.
 *
 * Bounds live in descriptions rather than in `minimum`, `maximum` or `maxItems`:
 * the structured-output API rejects those keywords with a 400, and the parsers
 * above enforce the same ranges on the way back in anyway.
 */
export const PROGRAM_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object',
  properties: {
    block: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        weeks: {
          type: 'integer',
          description: `How long the block runs, from ${MIN_BLOCK_WEEKS} to ${MAX_BLOCK_WEEKS} weeks.`,
        },
        sessionsPerWeek: {
          type: 'integer',
          description:
            `How many sessions a week, from ${MIN_DAYS_PER_WEEK} to ${MAX_DAYS_PER_WEEK}.`,
        },
      },
      required: ['name', 'weeks', 'sessionsPerWeek'],
      additionalProperties: false,
    },
    sessions: {
      type: 'array',
      description: `The sessions in the block, at most ${MAX_SESSIONS} of them.`,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          focus: { type: 'string' },
          exercises: {
            type: 'array',
            description:
              `The exercises in this session, at most ${MAX_EXERCISES_PER_SESSION} of them.`,
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
