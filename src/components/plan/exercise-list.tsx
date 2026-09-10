/**
 * A session's exercises the way Hevy's routine detail shows them: the name, and
 * under it the grey line of sets, reps, load and RPE. Sits inside a session card,
 * separated from the card's header by the same hairline the card is drawn with.
 */
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Exercise } from '../../lib/types';
import { useTheme } from '../assistant-ui/theme';
import { exerciseDetail } from './format';

function ExerciseRow({ exercise }: { readonly exercise: Exercise }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: colors.cardForeground }]}>{exercise.title}</Text>
      <Text style={[styles.detail, { color: colors.mutedForeground }]}>
        {exerciseDetail(exercise)}
      </Text>
    </View>
  );
}

export function ExerciseList({ exercises }: { readonly exercises: readonly Exercise[] }) {
  const { colors } = useTheme();
  if (exercises.length === 0) return null;

  return (
    <View style={[styles.list, { borderTopColor: colors.border }]}>
      {exercises.map((exercise, index) => (
        <Fragment key={`${index} ${exercise.templateId}`}>
          {index > 0 ? (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          ) : null}
          <ExerciseRow exercise={exercise} />
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  row: {
    gap: 2,
    paddingVertical: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  detail: {
    fontSize: 14,
    lineHeight: 19,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
