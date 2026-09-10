/**
 * The two cards the Plan tab is made of, sharing one look: Hevy's routine card,
 * hairline border, rounded corners, card ground. The next session is pinned open
 * because it is the one the user is about to train; every other session opens on
 * a tap. A session the last thirty Hevy workouts already answer carries the
 * coach's verdict under it, one line, with the way back to the thread.
 */
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Completion, Session } from '../../lib/types';
import { Radius, useTheme } from '../assistant-ui/theme';
import { ExerciseList } from './exercise-list';
import { exerciseSummary, firstLine, relativeDay } from './format';

const COACH_TAB: Href = '/(tabs)/coach';
const NEXT_PREFIX = 'Next: ';
const VERDICT_LINK = 'See verdict';
const CHEVRON = '›';
const VERDICT_LINES = 2;
const PRESSED_OPACITY = 0.6;

export interface SessionCardProps {
  readonly session: Session;
  readonly completion: Completion | null;
}

function SeeVerdictLink() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Opens the coach thread"
      onPress={() => router.navigate(COACH_TAB)}
      style={({ pressed }) => [styles.link, pressed && { opacity: PRESSED_OPACITY }]}
    >
      <Text style={[styles.linkLabel, { color: colors.accent }]}>{VERDICT_LINK}</Text>
    </Pressable>
  );
}

function CompletionNote({ completion }: { readonly completion: Completion }) {
  const { colors } = useTheme();
  const done = relativeDay(completion.completedAt);
  const verdict = firstLine(completion.verdict ?? '');

  return (
    <View
      style={[
        styles.completion,
        { borderTopColor: colors.border },
        verdict ? null : styles.completionClosed,
      ]}
    >
      {done ? (
        <Text style={[styles.grey, { color: colors.mutedForeground }]}>{`Done ${done}`}</Text>
      ) : null}
      {verdict ? (
        <Text style={[styles.grey, { color: colors.mutedForeground }]} numberOfLines={VERDICT_LINES}>
          {verdict}
        </Text>
      ) : null}
      {verdict ? <SeeVerdictLink /> : null}
    </View>
  );
}

/** The session after the most recently completed one, open and in full. */
export function NextSessionCard({ session, completion }: SessionCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: colors.cardForeground }]}>
            {`${NEXT_PREFIX}${session.name}`}
          </Text>
          {session.focus ? (
            <Text style={[styles.grey, { color: colors.mutedForeground }]}>{session.focus}</Text>
          ) : null}
        </View>
      </View>
      <ExerciseList exercises={session.exercises} />
      {completion ? <CompletionNote completion={completion} /> : null}
    </View>
  );
}

/** Collapsed to Hevy's one-line exercise summary until it is tapped. */
export function SessionCard({ session, completion }: SessionCardProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const secondary = expanded ? session.focus : exerciseSummary(session.exercises);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={session.name}
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Hides the exercises' : 'Shows the exercises'}
        onPress={() => setExpanded((open) => !open)}
        style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.muted }]}
      >
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: colors.cardForeground }]} numberOfLines={1}>
            {session.name}
          </Text>
          {secondary ? (
            <Text style={[styles.grey, { color: colors.mutedForeground }]} numberOfLines={1}>
              {secondary}
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.chevron, { color: colors.mutedForeground }, expanded && styles.chevronOpen]}
        >
          {CHEVRON}
        </Text>
      </Pressable>
      {expanded ? <ExerciseList exercises={session.exercises} /> : null}
      {completion ? <CompletionNote completion={completion} /> : null}
    </View>
  );
}

const HEADER_HEIGHT = 44;

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: HEADER_HEIGHT,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  grey: {
    fontSize: 14,
    lineHeight: 19,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  completion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  /** With no verdict there is no 44 pt link to close the card, so pad it. */
  completionClosed: {
    paddingBottom: 12,
  },
  link: {
    justifyContent: 'center',
    minHeight: HEADER_HEIGHT,
  },
  linkLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
