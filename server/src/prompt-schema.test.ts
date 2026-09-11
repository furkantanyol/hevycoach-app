import { describe, expect, it } from 'vitest';
import { CREATE_PROGRAM_TOOL, PLAN_OUTPUT_SCHEMA } from './plan-prompt.js';
import { REVIEW_OUTPUT_SCHEMA, reviewTask } from './review-prompt.js';
import { EQUIPMENT, GOALS, INJURIES, YEARS_TRAINING, type Profile } from './state.js';

const RANGE_KEYWORDS = ['minimum', 'maximum', 'maxItems', 'minItems'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectSchemas(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(objectSchemas);
  if (!isRecord(node)) return [];
  const nested = Object.values(node).flatMap(objectSchemas);
  return node.type === 'object' ? [node, ...nested] : nested;
}

function everyKey(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(everyKey);
  if (!isRecord(node)) return [];
  return Object.entries(node).flatMap(([key, value]) => [key, ...everyKey(value)]);
}

const profile: Profile = {
  goals: ['muscle', 'strength'],
  daysPerWeek: 4,
  bodyweightKg: 82,
  injuries: ['knee', 'shoulder'],
  notes: 'left knee, Hoffa fat pad; travels one week a month',
  equipment: 'full_gym',
  sessionMinutes: 60,
  yearsTraining: '3-5',
};

const REVIEW_HEADINGS = ['**Went well**', '**Push next time**', '**Proposed change**'];

function messageDescription(): string {
  const properties = REVIEW_OUTPUT_SCHEMA.properties as { message: { description: string } };
  return properties.message.description;
}

const ENUM_FIELDS: [string, readonly string[]][] = [
  ['equipment', EQUIPMENT],
  ['yearsTraining', YEARS_TRAINING],
];

function profileSchema(): Record<string, unknown> {
  const [, schema] = objectSchemas(CREATE_PROGRAM_TOOL.input_schema);
  return schema ?? {};
}

function profileProperty(field: string): Record<string, unknown> {
  const properties = profileSchema().properties as Record<string, Record<string, unknown>>;
  return properties[field];
}

describe('CREATE_PROGRAM_TOOL', () => {
  it('should be named create_program', () => {
    expect(CREATE_PROGRAM_TOOL.name).toBe('create_program');
  });

  it('should be strict so the input is schema validated', () => {
    expect(CREATE_PROGRAM_TOOL.strict).toBe(true);
  });

  it('should forbid additional properties at every object level', () => {
    const levels = objectSchemas(CREATE_PROGRAM_TOOL.input_schema);

    expect(levels.every((level) => level.additionalProperties === false)).toBe(true);
  });

  it('should require a profile and a reason', () => {
    expect(CREATE_PROGRAM_TOOL.input_schema.required).toEqual(['profile', 'reason']);
  });

  it('should require every field the profile carries', () => {
    expect(profileSchema().required).toEqual(Object.keys(profile));
  });

  it.each(ENUM_FIELDS)('should enumerate every %s option', (field, options) => {
    expect(profileProperty(field).enum).toEqual([...options]);
  });

  it('should enumerate every injury option on the array items', () => {
    expect(profileProperty('injuries').items).toEqual({ type: 'string', enum: [...INJURIES] });
  });

  it('should enumerate every goal option on the array items', () => {
    expect(profileProperty('goals').items).toEqual({ type: 'string', enum: [...GOALS] });
  });

  it('should use no range keywords the messages API rejects', () => {
    const keys = everyKey(CREATE_PROGRAM_TOOL.input_schema);

    expect(RANGE_KEYWORDS.filter((keyword) => keys.includes(keyword))).toEqual([]);
  });
});

describe('PLAN_OUTPUT_SCHEMA', () => {
  it('should use no range keywords the messages API rejects', () => {
    const keys = everyKey(PLAN_OUTPUT_SCHEMA);

    expect(RANGE_KEYWORDS.filter((keyword) => keys.includes(keyword))).toEqual([]);
  });

  it('should forbid additional properties at every object level', () => {
    const levels = objectSchemas(PLAN_OUTPUT_SCHEMA);

    expect(levels.every((level) => level.additionalProperties === false)).toBe(true);
  });

  it('should require an analysis and a block', () => {
    expect(PLAN_OUTPUT_SCHEMA.required).toEqual(['analysis', 'block']);
  });

  it('should describe each exercise with the fields the guard checks', () => {
    const exerciseSchema = objectSchemas(PLAN_OUTPUT_SCHEMA).at(-1);

    const fields = ['templateId', 'title', 'sets', 'reps', 'weightKg', 'rpe', 'note'];

    expect(exerciseSchema?.required).toEqual(fields);
  });
});

describe('REVIEW_OUTPUT_SCHEMA', () => {
  it('should use no range keywords the messages API rejects', () => {
    const keys = everyKey(REVIEW_OUTPUT_SCHEMA);

    expect(RANGE_KEYWORDS.filter((keyword) => keys.includes(keyword))).toEqual([]);
  });

  it('should require a message, a memory and a proposal', () => {
    expect(REVIEW_OUTPUT_SCHEMA.required).toEqual(['message', 'memory', 'proposal']);
  });

  it('should forbid additional properties at every object level', () => {
    const levels = objectSchemas(REVIEW_OUTPUT_SCHEMA);

    expect(levels.every((level) => level.additionalProperties === false)).toBe(true);
  });

  it.each(REVIEW_HEADINGS)('should describe the message with the %s heading', (heading) => {
    expect(messageDescription()).toContain(heading);
  });
});

describe('reviewTask', () => {
  it.each(REVIEW_HEADINGS)('should ask the review message for the %s heading', (heading) => {
    expect(reviewTask('the workout', 'the targets', 'the memory')).toContain(heading);
  });

  it('should ask for the proposal heading only when there is a proposal', () => {
    expect(reviewTask('the workout', 'the targets', 'the memory')).toContain('only when you are proposing one');
  });

  it('should keep the question out of the bullets', () => {
    expect(reviewTask('the workout', 'the targets', 'the memory')).toContain('plain last line');
  });
});
