import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** Lift detail exists inside the two stacks that push it, so the tab bar survives the push. */
export type LiftDetailPathname = '/program/lift/[templateId]' | '/review/lift/[templateId]';

type LiftLinkProps = {
  readonly pathname: LiftDetailPathname;
  readonly templateId: string;
  readonly title: string;
  readonly detail: string;
};

const MIN_TAP_TARGET = 44;

export function LiftLink({ pathname, templateId, title, detail }: LiftLinkProps) {
  return (
    <Link href={{ pathname, params: { templateId, title } }} asChild>
      <Pressable accessibilityRole="button" style={styles.row}>
        <ThemedText>{title}</ThemedText>
        <ThemedText type="small" themeColor="inkSecondary">
          {detail}
        </ThemedText>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
});
