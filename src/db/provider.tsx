import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { createContext, use, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import migrations from '../../drizzle/migrations';

import { db } from './client';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const DatabaseContext = createContext<typeof db | null>(null);

/** Runs the Drizzle migrations before anything downstream can read the database. */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Database error</ThemedText>
        <ThemedText themeColor="textSecondary">{error.message}</ThemedText>
      </ThemedView>
    );
  }

  if (!success) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <DatabaseContext value={db}>{children}</DatabaseContext>;
}

export function useDatabase() {
  const database = use(DatabaseContext);

  if (!database) {
    throw new Error('useDatabase must be used inside a DatabaseProvider.');
  }

  return database;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
