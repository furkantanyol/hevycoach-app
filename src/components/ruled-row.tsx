import { StyleSheet, Text, View } from 'react-native';

import { Rule } from './motion';
import { Stamp } from './stamp';

import { Figures, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MIN_ROW_HEIGHT = 44;
/** How far a figure may shrink to stay in its column when Dynamic Type enlarges it. */
const MINIMUM_FIGURE_SCALE = 0.7;
/** Wide enough for the largest figure the sheet prints — `102.5` at the lead row's size. */
const FIGURE_COLUMN_WIDTH = 88;
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
  /** A row that belongs under the one above it, such as an exercise under its muscle group. */
  readonly sub?: boolean;
};

/**
 * One line of the ruled table: a label on the left, figures in fixed columns on the right, and the
 * hairline the next row sits on. Every number it shows was given to it — the routine's own stored
 * target, or a set the user logged — because this component has no business deriving one.
 */
export function RuledRow({ label, figures, note, lead = false, sub = false }: RuledRowProps) {
  const theme = useTheme();

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.labelColumn}>
          <Text
            dynamicTypeRamp="body"
            style={[
              styles.label,
              lead && styles.labelLead,
              sub && styles.labelSub,
              { color: sub ? theme.inkSecondary : theme.ink },
            ]}
          >
            {label}
          </Text>
          {note ? (
            <Text
              dynamicTypeRamp="footnote"
              style={[styles.note, Figures.tabular, { color: theme.inkSecondary }]}
            >
              {note}
            </Text>
          ) : null}
        </View>
        {figures.map((figure, column) => (
          <Text
            // Columns are positions in a fixed table, so their index is their identity.
            key={column}
            dynamicTypeRamp="body"
            // A column is a fixed width, and Dynamic Type is not: a figure shrinks to stay inside
            // its column rather than spilling across the one beside it.
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={MINIMUM_FIGURE_SCALE}
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

type RuledHeaderProps = {
  /** What the left column holds, stamped: EXERCISE, MUSCLE GROUP, SESSION. */
  readonly label: string;
  /** One stamp per figure column, in the same order the rows print them. */
  readonly columns: readonly string[];
};

/**
 * The head of a ruled table: the column stamps over the ink rule the rows hang from. It shares
 * this file with the row so the column width is decided once, which is the only way the stamps
 * and the figures under them can line up.
 */
export function RuledHeader({ label, columns }: RuledHeaderProps) {
  return (
    <View>
      <View style={styles.headerRow}>
        <Stamp style={styles.labelColumn}>{label}</Stamp>
        {columns.map((column) => (
          <Stamp key={column} style={styles.headerFigure}>
            {column}
          </Stamp>
        ))}
      </View>
      <Rule weight="ink" />
    </View>
  );
}

const SUB_LABEL_SIZE = 14;
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  headerFigure: {
    width: FIGURE_COLUMN_WIDTH,
    textAlign: 'right',
  },
  labelColumn: {
    flex: 1,
  },
  label: {
    fontSize: LABEL_SIZE,
    lineHeight: ROW_LINE_HEIGHT,
    fontWeight: '500',
  },
  labelSub: {
    fontSize: SUB_LABEL_SIZE,
    fontWeight: '400',
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
