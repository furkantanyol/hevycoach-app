import { asc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { Button, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { saveRoutineTitle } from './outbox';

import { ThemedText } from '@/components/themed-text';
import { useDatabase } from '@/db/provider';
import { routines } from '@/db/schema';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The airplane-mode demo: renaming a routine writes to SQLite and to the outbox, online or not.
 */
export function RoutineEditor() {
  const db = useDatabase();
  const theme = useTheme();
  const { data } = useLiveQuery(db.select().from(routines).orderBy(asc(routines.title)));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const selected = data.find((routine) => routine.id === selectedId) ?? null;

  const select = (routineId: string, routineTitle: string) => {
    setSelectedId(routineId);
    setTitle(routineTitle);
  };

  const save = () => {
    if (selected) {
      saveRoutineTitle(db, selected, title.trim());
      setSelectedId(null);
      setTitle('');
    }
  };

  if (data.length === 0) {
    return <ThemedText themeColor="textSecondary">Sync once to load your routines.</ThemedText>;
  }

  return (
    <View style={styles.section}>
      <View style={styles.chips}>
        {data.map((routine) => (
          <Pressable
            key={routine.id}
            onPress={() => select(routine.id, routine.title)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  routine.id === selectedId ? theme.backgroundSelected : theme.backgroundElement,
              },
            ]}
          >
            <ThemedText type="small">{routine.title}</ThemedText>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        editable={selected !== null}
        placeholder="Pick a routine, then type a new title"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      <Button title="Queue rename" onPress={save} disabled={!selected || title.trim().length === 0} />

      <ThemedText type="small" themeColor="textSecondary">
        Renames are prefixed with [TEST] until the account owner lifts the guard.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
