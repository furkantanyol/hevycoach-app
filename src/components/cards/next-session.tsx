/**
 * Card three: the session the block says is next, its first four exercises,
 * and the reminder that the routine is already in Hevy — the app never opens
 * it, the athlete does.
 */
import { StyleSheet, Text, View } from 'react-native';

import { CardCaption, CardLabel, SKELETON } from './card-text';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

const MAX_EXERCISES = 4;
const LABEL = 'Next';
const CAPTION = 'Open it in Hevy';
const EMPTY = 'No block yet — finish the chat below';

export function NextSessionCard({ view }: { readonly view: CardsView | null }) {
  const { colors } = useTheme();
  const next = view === null ? null : view.nextSession;

  if (next === null) {
    return (
      <View style={styles.card}>
        <CardLabel>{LABEL}</CardLabel>
        {view === null ? (
          <Text style={[styles.name, { color: colors.foreground }]}>{SKELETON}</Text>
        ) : (
          <Text style={[styles.empty, { color: colors.mutedForeground }]} numberOfLines={2}>
            {EMPTY}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <CardLabel>{LABEL}</CardLabel>
      <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
        {next.name}
      </Text>
      <Text style={[styles.exercises, { color: colors.mutedForeground }]} numberOfLines={2}>
        {next.exercises.slice(0, MAX_EXERCISES).join(', ')}
      </Text>
      <View style={styles.caption}>
        <CardCaption>{CAPTION}</CardCaption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
  },
  exercises: {
    fontSize: 15,
  },
  empty: {
    fontSize: 17,
    paddingTop: 4,
  },
  caption: {
    paddingTop: 8,
  },
});
