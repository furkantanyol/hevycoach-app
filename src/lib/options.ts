/**
 * Every union value in `Profile` has one human label, written once here so the
 * onboarding pickers and the Profile tab cannot drift apart. `profileValue`
 * turns a stored field into the line the Profile tab shows.
 */
import type { Goal, Injury, Profile } from './types';

export interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

const NONE = 'None';
const ONE_DECIMAL = 1;

export const SEX_LABELS: Readonly<Record<Profile['sex'], string>> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

export const GOAL_LABELS: Readonly<Record<Goal, string>> = {
  muscle: 'Muscle',
  strength: 'Strength',
  fat_loss: 'Fat loss',
  longevity: 'Longevity',
  athletic: 'Athletic performance',
};

export const YEARS_TRAINING_LABELS: Readonly<Record<Profile['yearsTraining'], string>> = {
  '<1': 'Under a year',
  '1-3': 'One to three years',
  '3-5': 'Three to five years',
  '5+': 'Five years or more',
};

export const EQUIPMENT_LABELS: Readonly<Record<Profile['equipment'], string>> = {
  full_gym: 'Full gym',
  home_gym: 'Home gym',
  dumbbells: 'Dumbbells only',
  bodyweight: 'Bodyweight only',
};

export const TRAINING_STYLE_LABELS: Readonly<Record<Profile['trainingStyle'], string>> = {
  powerlifting: 'Powerlifting',
  bodybuilding: 'Bodybuilding',
  hybrid: 'Hybrid',
  athletic: 'Athletic',
};

export const CARDIO_LABELS: Readonly<Record<Profile['cardio'], string>> = {
  none: 'None',
  zone2: 'Zone 2',
  hiit: 'HIIT',
  both: 'Zone 2 and HIIT',
};

export const INJURY_LABELS: Readonly<Record<Injury, string>> = {
  knee: 'Knee',
  shoulder: 'Shoulder',
  lower_back: 'Lower back',
  elbow_wrist: 'Elbow / wrist',
  hip: 'Hip',
  other: 'Other',
};

/** The label shown to the left of a value, one per profile field. */
export const FIELD_LABELS: Readonly<Record<keyof Profile, string>> = {
  sex: 'Sex',
  age: 'Age',
  heightCm: 'Height',
  bodyweightKg: 'Bodyweight',
  goals: 'Goals',
  daysPerWeek: 'Days per week',
  sessionMinutes: 'Session length',
  yearsTraining: 'Training age',
  equipment: 'Equipment',
  trainingStyle: 'Style',
  cardio: 'Cardio',
  injuries: 'Injuries',
  notes: 'Notes',
};

/** Keeps the label map the single source of both the copy and the order. */
function toOptions<T extends string>(labels: Readonly<Record<T, string>>): readonly Option<T>[] {
  const values = Object.keys(labels) as T[];
  return values.map((value) => ({ value, label: labels[value] }));
}

export const SEX_OPTIONS = toOptions(SEX_LABELS);
export const GOAL_OPTIONS = toOptions(GOAL_LABELS);
export const YEARS_TRAINING_OPTIONS = toOptions(YEARS_TRAINING_LABELS);
export const EQUIPMENT_OPTIONS = toOptions(EQUIPMENT_LABELS);
export const TRAINING_STYLE_OPTIONS = toOptions(TRAINING_STYLE_LABELS);
export const CARDIO_OPTIONS = toOptions(CARDIO_LABELS);
export const INJURY_OPTIONS = toOptions(INJURY_LABELS);

/** 82 rather than 82.0, 82.4 rather than 82.40000000000001. */
function decimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(ONE_DECIMAL);
}

type FieldValue = (profile: Profile) => string;

const FIELD_VALUES: Readonly<Record<keyof Profile, FieldValue>> = {
  sex: (profile) => SEX_LABELS[profile.sex],
  age: (profile) => String(profile.age),
  heightCm: (profile) => `${decimal(profile.heightCm)} cm`,
  bodyweightKg: (profile) => `${decimal(profile.bodyweightKg)} kg`,
  goals: (profile) => profile.goals.map((goal) => GOAL_LABELS[goal]).join(', '),
  daysPerWeek: (profile) => String(profile.daysPerWeek),
  sessionMinutes: (profile) => `${profile.sessionMinutes} min`,
  yearsTraining: (profile) => YEARS_TRAINING_LABELS[profile.yearsTraining],
  equipment: (profile) => EQUIPMENT_LABELS[profile.equipment],
  trainingStyle: (profile) => TRAINING_STYLE_LABELS[profile.trainingStyle],
  cardio: (profile) => CARDIO_LABELS[profile.cardio],
  injuries: (profile) =>
    profile.injuries.length > 0
      ? profile.injuries.map((injury) => INJURY_LABELS[injury]).join(', ')
      : NONE,
  notes: (profile) => profile.notes.trim() || NONE,
};

/** The human value of one profile field, ready to render. */
export function profileValue(profile: Profile, field: keyof Profile): string {
  return FIELD_VALUES[field](profile);
}
