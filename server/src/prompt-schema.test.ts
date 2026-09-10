import { describe, expect, it } from 'vitest';
import { CREATE_PROGRAM_TOOL, PLAN_OUTPUT_SCHEMA, VERDICT_OUTPUT_SCHEMA } from './prompt.js';
import { CARDIO, EQUIPMENT, GOALS, INJURIES, SEXES, TRAINING_STYLES, YEARS_TRAINING, type Profile } from './state.js';

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
  sex: 'male',
  age: 34,
  heightCm: 180,
  bodyweightKg: 82,
  goals: ['muscle', 'strength'],
  daysPerWeek: 4,
  sessionMinutes: 60,
  yearsTraining: '3-5',
  equipment: 'full_gym',
  trainingStyle: 'hybrid',
  cardio: 'zone2',
  injuries: ['knee', 'shoulder'],
  notes: 'left knee, Hoffa fat pad; travels one week a month',
};

const ENUM_FIELDS: [string, readonly string[]][] = [
  ['sex', SEXES],
  ['yearsTraining', YEARS_TRAINING],
  ['equipment', EQUIPMENT],
  ['trainingStyle', TRAINING_STYLES],
  ['cardio', CARDIO],
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

describe('VERDICT_OUTPUT_SCHEMA', () => {
  it('should use no range keywords the messages API rejects', () => {
    const keys = everyKey(VERDICT_OUTPUT_SCHEMA);

    expect(RANGE_KEYWORDS.filter((keyword) => keys.includes(keyword))).toEqual([]);
  });

  it('should require a message and a memory', () => {
    expect(VERDICT_OUTPUT_SCHEMA.required).toEqual(['message', 'memory']);
  });

  it('should forbid additional properties at every object level', () => {
    const levels = objectSchemas(VERDICT_OUTPUT_SCHEMA);

    expect(levels.every((level) => level.additionalProperties === false)).toBe(true);
  });
});
