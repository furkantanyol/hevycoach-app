/**
 * Renders what the coach attached to a message: a verdict's session caption
 * above the text, and a plan's block as one card per session under it. The
 * wire shape is `metadata.custom = { kind, block, session }` — see the Routes
 * table in docs/spec.md and `toMessageLike` in src/coach-adapter.ts.
 */
import { useAuiState } from '@assistant-ui/react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, useTheme } from './theme';

const MINUTE_DIGITS = 2;

type PlanSession = {
  readonly name: string;
  readonly summary: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/** One grey line per routine, the way Hevy lists a routine's exercises. */
function exerciseSummary(exercises: unknown): string {
  if (!isUnknownArray(exercises)) return '';
  return exercises
    .map((exercise) => (isRecord(exercise) ? readString(exercise, 'title') : ''))
    .filter((title) => title.length > 0)
    .join(', ');
}

function planSessions(custom: Record<string, unknown>): readonly PlanSession[] {
  if (custom.kind !== 'plan') return [];
  const { block } = custom;
  if (!isRecord(block) || !isUnknownArray(block.sessions)) return [];
  return block.sessions.flatMap((session) => {
    if (!isRecord(session)) return [];
    const name = readString(session, 'name');
    if (!name) return [];
    return [{ name, summary: exerciseSummary(session.exercises) }];
  });
}

/** Local 24h clock. Hermes' Intl is not relied on for a caption. */
function clockTime(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(MINUTE_DIGITS, '0')}`;
}

function verdictCaption(custom: Record<string, unknown>, createdAt: Date): string {
  if (custom.kind !== 'verdict') return '';
  const session = readString(custom, 'session');
  const time = clockTime(createdAt);
  return session ? `${session} · ${time}` : time;
}

/** Which session a verdict judges, and when — grey, above the message. */
export function VerdictCaption() {
  const { colors } = useTheme();
  const custom = useAuiState((s) => s.message.metadata.custom);
  const createdAt = useAuiState((s) => s.message.createdAt);
  const caption = verdictCaption(custom, createdAt);

  if (!caption) return null;
  return <Text style={[styles.caption, { color: colors.mutedForeground }]}>{caption}</Text>;
}

/** The sessions a plan wrote into Hevy, one card each, under the coach's text. */
export function PlanCards() {
  const { colors } = useTheme();
  const custom = useAuiState((s) => s.message.metadata.custom);
  const sessions = useMemo(() => planSessions(custom), [custom]);

  if (sessions.length === 0) return null;
  return (
    <View style={styles.cards}>
      {sessions.map((session, index) => (
        <View
          key={`${index} ${session.name}`}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.cardTitle, { color: colors.cardForeground }]} numberOfLines={1}>
            {session.name}
          </Text>
          {session.summary.length > 0 ? (
            <Text style={[styles.cardSummary, { color: colors.mutedForeground }]} numberOfLines={1}>
              {session.summary}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  cards: {
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 12,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardSummary: {
    fontSize: 14,
    lineHeight: 19,
  },
});
