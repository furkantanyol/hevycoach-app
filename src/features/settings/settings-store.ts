import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
