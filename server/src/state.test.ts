import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyState, loadState, saveState, type Profile, type State } from './state.js';

const MEMORY = 'Squats stalled at 100 kg for two weeks.';

const PROFILE: Profile = {
  sex: 'male',
  age: 34,
  heightCm: 180,
  bodyweightKg: 82,
  primaryGoal: 'muscle',
  secondaryGoal: 'strength',
  daysPerWeek: 4,
  sessionMinutes: 60,
  yearsTraining: '3-5',
  equipment: 'full_gym',
  trainingStyle: 'hybrid',
  cardio: 'zone2',
  injuries: ['knee'],
  notes: 'left knee, Hoffa fat pad',
};

/** The profile shape saved before the structured onboarding amendment. */
const OLD_PROFILE = {
  goal: 'get stronger without losing the knee',
  daysPerWeek: 4,
  experience: 'intermediate',
  equipment: 'full commercial gym',
  constraints: 'left knee, Hoffa fat pad',
  notes: 'travels one week a month',
};

describe('state', () => {
  let directory: string;
  let path: string;

  async function writeOnDisk(contents: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(contents), 'utf8');
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hevycoach-state-'));
    path = join(directory, 'data', 'state.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should return the empty state when the file is missing', async () => {
    await expect(loadState(path)).resolves.toEqual(emptyState());
  });

  it('should return the same state when a saved state is loaded back', async () => {
    const state: State = {
      ...emptyState(),
      profile: PROFILE,
      memory: MEMORY,
      messages: [
        { id: 'm1', role: 'user', text: 'four days a week', createdAt: '2026-09-10T10:00:00.000Z' },
        {
          id: 'm2',
          role: 'assistant',
          text: 'Upper/lower it is.',
          createdAt: '2026-09-10T10:00:01.000Z',
          kind: 'plan',
        },
      ],
      pushToken: 'ExponentPushToken[test]',
      seenEvents: ['event-1'],
    };

    await saveState(path, state);

    await expect(loadState(path)).resolves.toEqual(state);
  });

  it('should discard a profile saved in the old shape instead of failing the load', async () => {
    await writeOnDisk({ ...emptyState(), profile: OLD_PROFILE });

    await expect(loadState(path)).resolves.toEqual(emptyState());
  });

  it('should keep the rest of the state when the old profile is discarded', async () => {
    await writeOnDisk({ ...emptyState(), profile: OLD_PROFILE, memory: MEMORY });

    await expect(loadState(path)).resolves.toMatchObject({ memory: MEMORY });
  });

  it('should discard a profile whose enum value is no longer an option', async () => {
    await writeOnDisk({ ...emptyState(), profile: { ...PROFILE, equipment: 'full commercial gym' } });

    await expect(loadState(path)).resolves.toEqual(emptyState());
  });

  it('should throw when the file holds something that is not JSON', async () => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'not json', 'utf8');

    await expect(loadState(path)).rejects.toThrow();
  });
});
