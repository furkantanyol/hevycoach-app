import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyState, loadState, saveState, type Message, type Profile, type State } from './state.js';

const MEMORY = 'Squats stalled at 100 kg for two weeks.';

const PROFILE: Profile = {
  goals: ['muscle', 'strength'],
  daysPerWeek: 4,
  bodyweightKg: 82,
  injuries: ['knee'],
  notes: 'left knee, Hoffa fat pad',
  equipment: 'full_gym',
  sessionMinutes: 60,
  yearsTraining: '3-5',
};

/** Saved before the one-screen amendment reduced the profile: every reduced field is still in it. */
const WIDE_PROFILE = {
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
  injuries: ['knee'],
  notes: 'left knee, Hoffa fat pad',
};

/** The profile shape saved before structured onboarding. */
const OLD_PROFILE = {
  goal: 'get stronger without losing the knee',
  daysPerWeek: 4,
  experience: 'intermediate',
  equipment: 'full commercial gym',
  constraints: 'left knee, Hoffa fat pad',
  notes: 'travels one week a month',
};

const verdictMessage = {
  id: 'm1',
  role: 'assistant',
  text: 'Solid session.',
  createdAt: '2026-09-10T10:00:00.000Z',
  kind: 'verdict',
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
    const messages: Message[] = [
      { id: 'm1', role: 'assistant', text: 'What are you training for?', createdAt: '2026-09-10T10:00:00.000Z', choices: [{ label: 'Muscle', value: 'muscle' }], multi: true },
      { id: 'm2', role: 'user', text: 'Muscle', createdAt: '2026-09-10T10:00:01.000Z' },
    ];
    const state: State = {
      ...emptyState(),
      profile: PROFILE,
      memory: MEMORY,
      messages,
      pushToken: 'ExponentPushToken[test]',
      seenEvents: ['event-1'],
      intake: { step: 'daysPerWeek', answers: { goals: ['muscle'] } },
      pendingProposal: { sessionIndex: 1, exercises: [], messageId: 'm2' },
    };

    await saveState(path, state);

    await expect(loadState(path)).resolves.toEqual(state);
  });

  it('should discard a profile saved in the old shape instead of failing the load', async () => {
    await writeOnDisk({ ...emptyState(), profile: OLD_PROFILE });

    await expect(loadState(path)).resolves.toEqual(emptyState());
  });

  it('should keep a profile that still answers every field the reduced shape needs', async () => {
    await writeOnDisk({ ...emptyState(), profile: WIDE_PROFILE });

    await expect(loadState(path)).resolves.toMatchObject({ profile: { goals: ['muscle', 'strength'], bodyweightKg: 82 } });
  });

  it('should keep the rest of the state when a profile is discarded', async () => {
    await writeOnDisk({ ...emptyState(), profile: OLD_PROFILE, memory: MEMORY });

    await expect(loadState(path)).resolves.toMatchObject({ memory: MEMORY });
  });

  it('should discard a profile whose enum value is no longer an option', async () => {
    await writeOnDisk({ ...emptyState(), profile: { ...PROFILE, equipment: 'full commercial gym' } });

    await expect(loadState(path)).resolves.toEqual(emptyState());
  });

  it('should read a message saved as a verdict as a review', async () => {
    await writeOnDisk({ ...emptyState(), messages: [verdictMessage] });

    const { messages } = await loadState(path);

    expect(messages[0].kind).toBe('review');
  });

  it('should leave a plan message alone', async () => {
    await writeOnDisk({ ...emptyState(), messages: [{ ...verdictMessage, kind: 'plan' }] });

    const { messages } = await loadState(path);

    expect(messages[0].kind).toBe('plan');
  });

  it('should read a state saved before intake and proposals existed', async () => {
    const older: Record<string, unknown> = { ...emptyState(), memory: MEMORY };
    delete older.intake;
    delete older.pendingProposal;
    await writeOnDisk(older);

    await expect(loadState(path)).resolves.toEqual({ ...emptyState(), memory: MEMORY });
  });

  it('should throw when the file holds something that is not JSON', async () => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, 'not json', 'utf8');

    await expect(loadState(path)).rejects.toThrow();
  });
});
