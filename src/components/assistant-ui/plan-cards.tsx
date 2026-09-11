/**
 * The block a plan message wrote, laid out under the coach's words as Hevy's routine cards: one
 * per session, its name and a grey line of its exercises, and a tap that grows the card into the
 * whole session — every exercise with sets × reps × kg and RPE — the way the carousel cards open.
 * The wire shape is `metadata.custom.block` (docs/spec.md, the 10:30 amendment); `toMessageLike`
 * in src/coach-adapter.ts carries it, so a plan reloaded from the server draws the same cards.
 */
import { useAuiState } from '@assistant-ui/react-native';
import { Fragment, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { PlanBlock, PlanExercise, PlanSession } from '../../lib/types';
import { Card } from '../cards/card';
import { CardCaption, RowDivider } from '../cards/card-text';
import { ExpandedCard, useReduceMotion, type Frame } from '../cards/expanded-card';
import { formatWeight } from '../cards/format';
import { SystemIcon } from '../cards/system-icon';
import { useTheme } from './theme';

const OPEN_IN_HEVY = 'Open them in Hevy → Routines → Coach';
const OPEN_HINT = 'Shows every exercise with its sets, reps and load';
const ENTER_MS = 220;
const CHEVRON_SIZE = 13;
const ORDINAL_COLUMN = 24;
const PRESSED_OPACITY = 0.85;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isSession = (value: unknown): value is PlanSession =>
  isRecord(value) && typeof value.name === 'string' && Array.isArray(value.exercises);

const isBlock = (value: unknown): value is PlanBlock =>
  isRecord(value) && typeof value.name === 'string' && Array.isArray(value.sessions) && value.sessions.every(isSession);

/** The block as the server sends it, or null: a message without one draws no cards. */
function readBlock(custom: Record<string, unknown>): PlanBlock | null {
  const { block } = custom;
  return isBlock(block) ? block : null;
}

const summaryOf = (session: PlanSession): string => session.exercises.map((exercise) => exercise.title).join(', ');

/** "4 × 5 × 112.5 kg · RPE 8": the target Hevy now shows for the exercise. */
const targetOf = (exercise: PlanExercise): string =>
  `${exercise.sets} × ${exercise.reps} × ${formatWeight(exercise.weightKg)} kg · RPE ${exercise.rpe}`;

function ExerciseRow({ ordinal, exercise }: { readonly ordinal: number; readonly exercise: PlanExercise }) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.ordinal, { color: colors.mutedForeground }]}>{ordinal}</Text>
      <View style={styles.exercise}>
        <Text style={[styles.exerciseTitle, { color: colors.foreground }]} numberOfLines={2}>
          {exercise.title}
        </Text>
        <Text style={[styles.target, { color: colors.mutedForeground }]}>{targetOf(exercise)}</Text>
      </View>
    </View>
  );
}

/** Hevy's routine card on the pager side: the name, then the exercises in one grey line, or every exercise once expanded. */
function SessionContent({ session, expanded }: { readonly session: PlanSession; readonly expanded: boolean }) {
  const { colors } = useTheme();

  return (
    <View>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={expanded ? 2 : 1}>
          {session.name}
        </Text>
        {!expanded && <SystemIcon name="chevron.right" size={CHEVRON_SIZE} color={colors.mutedForeground} />}
      </View>
      {expanded ? (
        <View style={styles.list}>
          {session.exercises.map((exercise, index) => (
            <Fragment key={exercise.title}>
              {index > 0 && <RowDivider />}
              <ExerciseRow ordinal={index + 1} exercise={exercise} />
            </Fragment>
          ))}
        </View>
      ) : (
        <Text style={[styles.summary, { color: colors.mutedForeground }]} numberOfLines={2}>
          {summaryOf(session)}
        </Text>
      )}
    </View>
  );
}

/** One session card that opens in place, the way a carousel card does; it hides while its grown copy is on screen. */
function SessionTile({ session, reduceMotion }: { readonly session: PlanSession; readonly reduceMotion: boolean }) {
  const tile = useRef<View>(null);
  const [from, setFrom] = useState<Frame | null>(null);

  const open = () => {
    tile.current?.measureInWindow((x, y, width, height) => setFrom({ x, y, width, height }));
  };

  return (
    <>
      <Pressable
        ref={tile}
        accessibilityRole="button"
        accessibilityHint={OPEN_HINT}
        disabled={from !== null}
        onPress={open}
        style={({ pressed }) => [from !== null && styles.hidden, pressed && styles.pressed]}
      >
        <Card style={styles.tile}>
          <SessionContent session={session} expanded={false} />
        </Card>
      </Pressable>
      {from !== null && (
        <ExpandedCard from={from} reduceMotion={reduceMotion} onClose={() => setFrom(null)}>
          <SessionContent session={session} expanded />
        </ExpandedCard>
      )}
    </>
  );
}

export function PlanCards() {
  const block = useAuiState((s) => readBlock(s.message.metadata.custom));
  const reduceMotion = useReduceMotion();

  if (block === null) return null;

  return (
    <Animated.View entering={FadeInDown.duration(ENTER_MS)} style={styles.column}>
      {block.sessions.map((session) => (
        <SessionTile key={session.name} session={session} reduceMotion={reduceMotion} />
      ))}
      <CardCaption>{OPEN_IN_HEVY}</CardCaption>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  column: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 12,
  },
  // Sizes to its content: the pager's fill would collapse to nothing in a column of cards.
  tile: {
    flex: 0,
  },
  hidden: {
    opacity: 0,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  summary: {
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 4,
  },
  list: {
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  ordinal: {
    width: ORDINAL_COLUMN,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  exercise: {
    flex: 1,
    gap: 2,
  },
  exerciseTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  target: {
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
});
