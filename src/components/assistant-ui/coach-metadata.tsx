/**
 * What the coach attaches to a message that changes how it reads: a review's
 * caption above the text. The wire shape is `metadata.custom = { kind,
 * choices, multi }` — see docs/spec.md and `toMessageLike` in
 * src/coach-adapter.ts. A plan is prose, including the last line that names
 * the routines, so it needs nothing here.
 */
import { useAuiState } from '@assistant-ui/react-native';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from './theme';

const MINUTE_DIGITS = 2;
const REVIEW_PREFIX = 'Review · ';

/** Local 24h clock. Hermes' Intl is not relied on for a caption. */
function clockTime(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(MINUTE_DIGITS, '0')}`;
}

/** When the coach reviewed a workout — grey, above the message. */
export function ReviewCaption() {
  const { colors } = useTheme();
  const kind = useAuiState((s) => s.message.metadata.custom.kind);
  const createdAt = useAuiState((s) => s.message.createdAt);

  if (kind !== 'review') return null;
  return (
    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
      {REVIEW_PREFIX + clockTime(createdAt)}
    </Text>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
});
