import { StyleSheet, Text, View } from 'react-native';

import { Rule } from './motion';

import { Figures, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MIN_ROW_HEIGHT = 44;
const FIGURE_COLUMN_WIDTH = 76;
const LABEL_SIZE = 16;
const FIGURE_SIZE = 17;
const NOTE_SIZE = 13;
const ROW_LINE_HEIGHT = 22;
const NOTE_LINE_HEIGHT = 18;

type RuledRowProps = {
  readonly label: string;
  /**
   * The row's figures, right to left in the same order on every row, so the columns line up down
   * the sheet. Each renders with tabular figures; an absent figure keeps its column open.
   */
  readonly figures: readonly (string | null)[];
  /** A quieter second line under the label: a date, or where the figure came from. */
  readonly note?: string | null;
  /** The row this session is actually about, set larger so it reads first from arm's length. */
  readonly lead?: boolean;
};

/**
 * One line of the ruled table: a label on the left, figures in fixed columns on the right, and the
 * hairline the next row sits on. Every number it shows was given to it — the routine's own stored
 * target, or a set the user logged — because this component has no business deriving one.
 */
export function RuledRow({ label, figures, note, lead = false }: RuledRowProps) {
  const theme = useTheme();

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.labelColumn}>
          <Text
            dynamicTypeRamp="body"
            style={[styles.label, lead && styles.labelLead, { color: theme.ink }]}
          >
            {label}
          </Text>
          {note ? (
            <Text dynamicTypeRamp="footnote" style={[styles.note, { color: theme.inkSecondary }]}>
              {note}
            </Text>
          ) : null}
        </View>
        {figures.map((figure, column) => (
          <Text
            // Columns are positions in a fixed table, so their index is their identity.
            key={column}
            dynamicTypeRamp="body"
            style={[
              styles.figure,
              Figures.tabular,
              lead && styles.figureLead,
              { color: figure === null ? theme.inkSecondary : theme.ink },
            ]}
          >
            {figure ?? '—'}
          </Text>
        ))}
      </View>
      <Rule />
    </View>
  );
}

const LEAD_LABEL_SIZE = 20;
const LEAD_FIGURE_SIZE = 34;
const LEAD_LINE_HEIGHT = 40;

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  labelColumn: {
    flex: 1,
  },
  label: {
    fontSize: LABEL_SIZE,
    lineHeight: ROW_LINE_HEIGHT,
    fontWeight: '500',
  },
  labelLead: {
    fontSize: LEAD_LABEL_SIZE,
    lineHeight: LEAD_LINE_HEIGHT,
    fontWeight: '600',
  },
  note: {
    fontSize: NOTE_SIZE,
    lineHeight: NOTE_LINE_HEIGHT,
  },
  figure: {
    width: FIGURE_COLUMN_WIDTH,
    textAlign: 'right',
    fontSize: FIGURE_SIZE,
    lineHeight: ROW_LINE_HEIGHT,
    fontWeight: '500',
  },
  figureLead: {
    fontSize: LEAD_FIGURE_SIZE,
    lineHeight: LEAD_LINE_HEIGHT,
    fontWeight: '600',
  },
});
