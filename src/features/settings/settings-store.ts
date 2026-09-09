import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import Storage from './storage';

type SettingsState = {
  exportEnabled: boolean;
  setExportEnabled: (exportEnabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      exportEnabled: false,
      setExportEnabled: (exportEnabled) => set({ exportEnabled }),
    }),
    {
      name: 'hevycoach-settings',
      storage: createJSONStorage(() => Storage),
    }
  )
);
