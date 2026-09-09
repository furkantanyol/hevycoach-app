import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import Storage from './storage';

import type { OnboardingAnswers } from '@/features/onboarding/answers';

type SettingsState = {
  exportEnabled: boolean;
  setExportEnabled: (exportEnabled: boolean) => void;
  /** Set once the five questions are answered; the first-run flow never asks again. */
  hasOnboarded: boolean;
  onboardingAnswers: OnboardingAnswers | null;
  saveOnboarding: (answers: OnboardingAnswers) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      exportEnabled: false,
      setExportEnabled: (exportEnabled) => set({ exportEnabled }),
      hasOnboarded: false,
      onboardingAnswers: null,
      saveOnboarding: (onboardingAnswers) => set({ onboardingAnswers, hasOnboarded: true }),
    }),
    {
      name: 'hevycoach-settings',
      storage: createJSONStorage(() => Storage),
    }
  )
);
