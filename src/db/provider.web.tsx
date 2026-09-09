import type { ReactNode } from 'react';

// Sync is iOS-only, so the web bundle never opens a database and never imports expo-sqlite.
export function DatabaseProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
