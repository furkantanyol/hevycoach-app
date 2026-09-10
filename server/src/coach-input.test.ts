import { describe, expect, it } from 'vitest';
import { programInput } from './coach.js';
import type { Profile } from './state.js';

const REASON = 'intake answered';

const PROFILE: Profile = {
  sex: 'female', age: 29, heightCm: 168, bodyweightKg: 63,
  goals: ['muscle', 'longevity'],
  daysPerWeek: 4, sessionMinutes: 45, yearsTraining: '1-3',
  equipment: 'home_gym', trainingStyle: 'bodybuilding', cardio: 'zone2',
  injuries: ['shoulder'], notes: 'right shoulder aches on overhead work',
};

/** The profile shape saved before the structured onboarding amendment. */
const OLD_PROFILE = {
  goal: 'get stronger',
  daysPerWeek: 4,
  experience: 'intermediate',
  equipment: 'full gym',
  constraints: '',
  notes: '',
};

const called = (profile: unknown): unknown => ({ profile, reason: REASON });

describe('programInput', () => {
  it('should return the profile and the reason when every field is valid', () => {
    expect(programInput(called(PROFILE))).toEqual({ profile: PROFILE, reason: REASON });
  });

  it('should accept a profile with a single goal', () => {
    const profile = { ...PROFILE, goals: ['muscle'] };

    expect(programInput(called(profile))).toEqual({ profile, reason: REASON });
  });

  it('should reject a profile with no goals', () => {
    expect(programInput(called({ ...PROFILE, goals: [] }))).toBeNull();
  });

  it('should reject a goal chosen twice', () => {
    expect(programInput(called({ ...PROFILE, goals: ['muscle', 'muscle'] }))).toBeNull();
  });

  it('should accept a profile with no injuries', () => {
    const profile = { ...PROFILE, injuries: [] };

    expect(programInput(called(profile))).toEqual({ profile, reason: REASON });
  });

  it('should reject a goal that is not one of the options', () => {
    expect(programInput(called({ ...PROFILE, goals: ['powerlifting'] }))).toBeNull();
  });

  it('should reject an equipment value that is not one of the options', () => {
    expect(programInput(called({ ...PROFILE, equipment: 'full commercial gym' }))).toBeNull();
  });

  it('should reject an injury that is not one of the options', () => {
    expect(programInput(called({ ...PROFILE, injuries: ['ankle'] }))).toBeNull();
  });

  it('should reject a profile with a field missing', () => {
    const incomplete: Record<string, unknown> = { ...PROFILE };
    delete incomplete.sessionMinutes;

    expect(programInput(called(incomplete))).toBeNull();
  });

  it('should reject a profile in the old shape', () => {
    expect(programInput(called(OLD_PROFILE))).toBeNull();
  });

  it('should reject an age that came back as a string', () => {
    expect(programInput(called({ ...PROFILE, age: '34' }))).toBeNull();
  });

  it('should reject a reason that is not text', () => {
    expect(programInput({ profile: PROFILE, reason: 4 })).toBeNull();
  });

  it('should reject an input that is not an object', () => {
    expect(programInput('create a program')).toBeNull();
  });
});
