import { describe, expect, it } from 'vitest';
import { cacheFor, NOTES_MAX_CHARACTERS, validateProfile } from './derived.js';
import type { Profile } from './state.js';

const TEN_MINUTES = 600_000;

const PROFILE: Profile = {
  sex: 'male',
  age: 32,
  heightCm: 183,
  bodyweightKg: 84,
  goals: ['muscle'],
  daysPerWeek: 4,
  sessionMinutes: 75,
  yearsTraining: '3-5',
  equipment: 'full_gym',
  trainingStyle: 'hybrid',
  cardio: 'zone2',
  injuries: ['knee'],
  notes: 'Left knee aches on deep squats.',
};

const errorOf = (body: unknown): string | undefined => {
  const result = validateProfile(body);
  return 'error' in result ? result.error : undefined;
};

describe('cacheFor', () => {
  const counter = () => {
    let loads = 0;
    return { load: async () => ++loads, loads: () => loads };
  };

  it('should load once for two reads inside the window', async () => {
    const { load, loads } = counter();
    let clock = 0;
    const cached = cacheFor(TEN_MINUTES, load, () => clock);

    await cached();
    clock = TEN_MINUTES - 1;
    await cached();

    expect(loads()).toBe(1);
  });

  it('should load again once the window has elapsed', async () => {
    const { load, loads } = counter();
    let clock = 0;
    const cached = cacheFor(TEN_MINUTES, load, () => clock);

    await cached();
    clock = TEN_MINUTES;
    await cached();

    expect(loads()).toBe(2);
  });
});

describe('validateProfile', () => {
  it('should accept a complete profile', () => {
    expect(validateProfile({ ...PROFILE })).toEqual({ profile: PROFILE });
  });

  it('should accept several goals', () => {
    expect(errorOf({ ...PROFILE, goals: ['muscle', 'strength'] })).toBeUndefined();
  });

  it('should reject a body that is not an object', () => {
    expect(errorOf('male')).toBe('profile must be an object');
  });

  it('should name the field when a union value is unknown', () => {
    expect(errorOf({ ...PROFILE, sex: 'unspecified' })).toBe('sex must be one of male, female, other');
  });

  it('should name the field when a goal is not an option', () => {
    expect(errorOf({ ...PROFILE, goals: ['hypertrophy'] })).toMatch(/^goals must be a non-empty array of /);
  });

  it('should name the field when the goals are empty', () => {
    expect(errorOf({ ...PROFILE, goals: [] })).toMatch(/^goals must be a non-empty array of /);
  });

  it('should name the field when a goal is chosen twice', () => {
    expect(errorOf({ ...PROFILE, goals: ['muscle', 'muscle'] })).toMatch(/each at most once$/);
  });

  it('should reject an age below the accepted range', () => {
    expect(errorOf({ ...PROFILE, age: 12 })).toBe('age must be a number between 13 and 100');
  });

  it('should accept an age on the lower edge of the range', () => {
    expect(errorOf({ ...PROFILE, age: 13 })).toBeUndefined();
  });

  it('should reject a height above the accepted range', () => {
    expect(errorOf({ ...PROFILE, heightCm: 231 })).toBe('heightCm must be a number between 120 and 230');
  });

  it('should reject a bodyweight below the accepted range', () => {
    expect(errorOf({ ...PROFILE, bodyweightKg: 29 })).toBe('bodyweightKg must be a number between 30 and 250');
  });

  it('should reject more days per week than a week holds', () => {
    expect(errorOf({ ...PROFILE, daysPerWeek: 8 })).toBe('daysPerWeek must be a number between 1 and 7');
  });

  it('should reject a session shorter than the accepted range', () => {
    expect(errorOf({ ...PROFILE, sessionMinutes: 19 })).toBe('sessionMinutes must be a number between 20 and 180');
  });

  it('should reject a numeric field sent as a string', () => {
    expect(errorOf({ ...PROFILE, age: '32' })).toBe('age must be a number between 13 and 100');
  });

  it('should reject an injury outside the known list', () => {
    expect(errorOf({ ...PROFILE, injuries: ['knee', 'ego'] })).toMatch(/^injuries must be an array of /);
  });

  it('should reject injuries sent as a bare string', () => {
    expect(errorOf({ ...PROFILE, injuries: 'knee' })).toMatch(/^injuries must be an array of /);
  });

  it('should reject notes longer than the limit', () => {
    const notes = 'a'.repeat(NOTES_MAX_CHARACTERS + 1);

    expect(errorOf({ ...PROFILE, notes })).toBe('notes must be a string of at most 1000 characters');
  });

  it('should accept notes exactly at the limit', () => {
    expect(errorOf({ ...PROFILE, notes: 'a'.repeat(NOTES_MAX_CHARACTERS) })).toBeUndefined();
  });

  it('should reject a profile missing a field entirely', () => {
    const { cardio: _cardio, ...withoutCardio } = PROFILE;

    expect(errorOf(withoutCardio)).toMatch(/^cardio must be one of /);
  });

  it('should reject a body carrying a key that is not a profile field', () => {
    expect(errorOf({ ...PROFILE, debug: true })).toBe('debug is not a profile field');
  });
});
