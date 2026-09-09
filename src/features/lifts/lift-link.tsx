import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { RuledRow } from '@/components/ruled-row';

/** Lift detail exists inside the two stacks that push it, so the tab bar survives the push. */
export type LiftDetailPathname = '/program/lift/[templateId]' | '/review/lift/[templateId]';

type LiftLinkProps = {
  readonly pathname: LiftDetailPathname;
  readonly templateId: string;
  readonly title: string;
  /** The row's figures, in the same columns as every other row of its table. */
  readonly figures: readonly (string | null)[];
  readonly note?: string | null;
  readonly sub?: boolean;
};

/** A row of the ruled table that happens to open the lift behind it. */
export function LiftLink({ pathname, templateId, title, figures, note, sub }: LiftLinkProps) {
  return (
    <Link href={{ pathname, params: { templateId, title } }} asChild>
      <Pressable accessibilityRole="button">
        <RuledRow label={title} figures={figures} note={note} sub={sub} />
      </Pressable>
    </Link>
  );
}
