import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import Storage from './storage';

import type { OnboardingAnswers } from '@/features/onboarding/answers';
import type { ProStatus } from '@/features/pro/pro-status';

type SettingsState = {
  exportEnabled: boolean;
  setExportEnabled: (exportEnabled: boolean) => void;
  /** Set once the five questions are answered; the first-run flow never asks again. */
  hasOnboarded: boolean;
  onboardingAnswers: OnboardingAnswers | null;
  saveOnboarding: (answers: OnboardingAnswers) => void;
  /** Persisted so the Pro check is not repeated on every launch. Cleared when the key changes. */
  proStatus: ProStatus;
  setProStatus: (proStatus: ProStatus) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      exportEnabled: false,
      setExportEnabled: (exportEnabled) => set({ exportEnabled }),
      hasOnboarded: false,
      onboardingAnswers: null,
      saveOnboarding: (onboardingAnswers) => set({ onboardingAnswers, hasOnboarded: true }),
      proStatus: 'unknown',
      setProStatus: (proStatus) => set({ proStatus }),
    }),
    {
      name: 'hevycoach-settings',
      storage: createJSONStorage(() => Storage),
    }
  )
);
