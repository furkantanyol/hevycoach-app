/**
 * One card per onboarding step, one row per profile field, the way Hevy groups
 * its settings. A row is the way back into the step that owns the field, so the
 * whole row is the tap target and it is never shorter than 44 pt.
 */
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProfileField } from '../../lib/onboarding-steps';
import { Radius, useTheme } from '../assistant-ui/theme';
import { SectionLabel } from '../screen';

const CHEVRON = '›';
const ROW_HEIGHT = 44;

export interface ProfileRowData {
  readonly field: ProfileField;
  readonly label: string;
  readonly value: string;
}

interface ProfileSectionProps {
  readonly title: string;
  readonly rows: readonly ProfileRowData[];
  readonly onSelect: (field: ProfileField) => void;
}

function ProfileRow({ row, onSelect }: { readonly row: ProfileRowData; readonly onSelect: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${row.value}`}
      accessibilityHint="Opens this step of your profile"
      onPress={onSelect}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
    >
      <Text style={[styles.label, { color: colors.cardForeground }]} numberOfLines={1}>
        {row.label}
      </Text>
      <Text style={[styles.value, { color: colors.mutedForeground }]} numberOfLines={1}>
        {row.value}
      </Text>
      <Text style={[styles.chevron, { color: colors.mutedForeground }]}>{CHEVRON}</Text>
    </Pressable>
  );
}

export function ProfileSection({ title, rows, onSelect }: ProfileSectionProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <SectionLabel>{title}</SectionLabel>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {rows.map((row, index) => (
          <Fragment key={row.field}>
            {index > 0 ? (
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            ) : null}
            <ProfileRow row={row} onSelect={() => onSelect(row.field)} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: {
    flexShrink: 0,
    fontSize: 16,
  },
  value: {
    flex: 1,
    fontSize: 16,
    textAlign: 'right',
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
});
