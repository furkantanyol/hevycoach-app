/**
 * Card three: the session the block says is next, its exercises — Hevy's
 * comma-separated summary on the card, the numbered list once expanded — and the
 * reminder that the routine is already in Hevy: the app never opens it, the
 * athlete does.
 */
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CardCaption, CardHeader, RowDivider, SKELETON } from './card-text';
import { joinDetails, plural } from './format';
import { useTheme } from '../assistant-ui/theme';
import type { CardsView } from '../../lib/types';

const LABEL = 'Next';
const CAPTION = 'Open it in Hevy';
const EMPTY = 'No block yet — finish the chat below';
const ORDINAL_COLUMN = 24;

interface NextSessionCardProps {
  readonly view: CardsView | null;
  readonly expanded?: boolean;
}

function ExerciseRow({ ordinal, title }: { readonly ordinal: number; readonly title: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.ordinal, { color: colors.mutedForeground }]}>{ordinal}</Text>
      <Text style={[styles.exercise, { color: colors.foreground }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

function ExerciseList({ exercises }: { readonly exercises: readonly string[] }) {
  return (
    <View style={styles.list}>
      {exercises.map((title, index) => (
        <Fragment key={title}>
          {index > 0 && <RowDivider />}
          <ExerciseRow ordinal={index + 1} title={title} />
        </Fragment>
      ))}
    </View>
  );
}

export function NextSessionCard({ view, expanded = false }: NextSessionCardProps) {
  const { colors } = useTheme();
  const next = view === null ? null : view.nextSession;

  if (next === null) {
    return (
      <View>
        <CardHeader label={LABEL} chevron={false} />
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
      <CardHeader label={LABEL} chevron={!expanded} />
      <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={expanded ? 3 : 2}>
        {next.name}
      </Text>
      {expanded ? (
        <ExerciseList exercises={next.exercises} />
      ) : (
        <Text style={[styles.summary, { color: colors.mutedForeground }]} numberOfLines={3}>
          {next.exercises.join(', ')}
        </Text>
      )}
      <View style={styles.footer}>
        <CardCaption>{joinDetails(plural(next.exercises.length, 'exercise'), CAPTION)}</CardCaption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  summary: {
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 4,
  },
  empty: {
    fontSize: 17,
    paddingTop: 4,
  },
  list: {
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  ordinal: {
    width: ORDINAL_COLUMN,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  exercise: {
    flex: 1,
    fontSize: 15,
  },
  footer: {
    // Pinned to the card's bottom edge on the pager; right after the list once expanded.
    marginTop: 'auto',
    paddingTop: 10,
  },
});
