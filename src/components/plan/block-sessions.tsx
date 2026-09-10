/**
 * The block's sessions in the order the coach wrote them: the next one pinned
 * open at the top, then the rest as collapsed cards. `completions` arrives keyed
 * by session index as a string, so the lookup crosses that back.
 */
import { StyleSheet, View } from 'react-native';

import type { Block, Completion } from '../../lib/types';
import { NextSessionCard, SessionCard } from './session-card';

export interface BlockSessionsProps {
  readonly block: Block;
  readonly nextSessionIndex: number | null;
  readonly completions: Readonly<Record<string, Completion>>;
}

/** The server owns `nextSessionIndex`; nothing outside the block is pinned. */
function pinned(index: number | null, sessions: number): index is number {
  return index !== null && Number.isInteger(index) && index >= 0 && index < sessions;
}

function completionAt(
  completions: Readonly<Record<string, Completion>>,
  index: number,
): Completion | null {
  return completions[String(index)] ?? null;
}

export function BlockSessions({ block, nextSessionIndex, completions }: BlockSessionsProps) {
  const next = pinned(nextSessionIndex, block.sessions.length) ? nextSessionIndex : null;

  return (
    <View style={styles.cards}>
      {next === null ? null : (
        <NextSessionCard
          session={block.sessions[next]}
          completion={completionAt(completions, next)}
        />
      )}
      {block.sessions.map((session, index) =>
        index === next ? null : (
          <SessionCard
            key={`${index} ${session.name}`}
            session={session}
            completion={completionAt(completions, index)}
          />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: {
    gap: 10,
  },
});
