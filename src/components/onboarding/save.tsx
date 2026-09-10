/**
 * The one write intake makes. PUT /profile validates field by field and answers
 * 400 `{ error }` naming the field, which is the text the grey error line
 * shows. Two callers share it: the review step, which saves and then asks for a
 * block, and a single step opened from the Profile tab, which saves and goes
 * straight back there.
 */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { describeError, serverJson } from '../../lib/server';
import type { Profile, ProfileResponse } from '../../lib/types';

export async function putProfile(profile: Profile): Promise<void> {
  await serverJson<ProfileResponse>('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

export interface SaveState {
  readonly busy: boolean;
  readonly error: string | null;
  readonly save: () => void;
}

/**
 * Saves and returns to whatever pushed this screen. Nothing is retried on its
 * own: a rejected field is the user's to fix, and the error line says which.
 */
export function useSaveAndReturn(profile: Profile | null): SaveState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await putProfile(profile);
      router.back();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }, [profile]);

  const save = useCallback(() => {
    void run();
  }, [run]);

  return { busy, error, save };
}
