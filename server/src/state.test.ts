import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyState, loadState, saveState, type State } from './state.js';

describe('state', () => {
  let directory: string;
  let path: string;

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
      memory: 'Squats stalled at 100 kg for two weeks.',
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
});
