import { AuiIf, ComposerPrimitive, useAuiState } from '@assistant-ui/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, useTheme } from './theme';

/** iOS minimum touch target, and the diameter of the round send button. */
const ACTION_SIZE = 44;
const SEND_GLYPH = '↑';
const MAX_MESSAGE_LENGTH = 4000;

function SendButton() {
  const { colors } = useTheme();
  const canSend = useAuiState((s) => s.composer.canSend);

  return (
    <ComposerPrimitive.Send
      accessibilityLabel="Send message"
      style={[styles.actionButton, { backgroundColor: canSend ? colors.accent : colors.border }]}
    >
      <Text
        style={[
          styles.sendGlyph,
          { color: canSend ? colors.accentForeground : colors.mutedForeground },
        ]}
      >
        {SEND_GLYPH}
      </Text>
    </ComposerPrimitive.Send>
  );
}

function CancelButton() {
  const { colors } = useTheme();
  return (
    <ComposerPrimitive.Cancel
      accessibilityLabel="Stop generating"
      style={[styles.actionButton, { backgroundColor: colors.accent }]}
    >
      <View style={[styles.stopGlyph, { backgroundColor: colors.accentForeground }]} />
    </ComposerPrimitive.Cancel>
  );
}

export function Composer() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={[styles.shell, { backgroundColor: colors.composer, borderColor: colors.border }]}
      >
        <ComposerPrimitive.Input
          style={[styles.input, { color: colors.foreground }]}
          placeholder="Message…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
        />

        <AuiIf condition={(s) => !s.thread.isRunning}>
          <SendButton />
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <CancelButton />
        </AuiIf>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: Spacing.threadMaxWidth + Spacing.gutter * 2,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: 8,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    borderRadius: Radius.composer,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    minHeight: ACTION_SIZE,
    maxHeight: 132,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
  },
  actionButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
  },
  stopGlyph: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
});
