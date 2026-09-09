import { describeQueryState, queryState } from './query-state';

import { ThemedText } from '@/components/themed-text';

type ObservedQuery = Parameters<typeof queryState>[0];

type QueryStatusProps = {
  readonly query: ObservedQuery;
  readonly hasRows: boolean;
  /** What to say when Hevy answered and there was nothing there. */
  readonly whenEmpty: string;
};

/** One line, wherever a screen would otherwise show a spinner that might never resolve. */
export function QueryStatus({ query, hasRows, whenEmpty }: QueryStatusProps) {
  const message = describeQueryState(queryState(query, hasRows), whenEmpty);
  if (message === null) {
    return null;
  }

  return (
    <ThemedText type="small" themeColor="textSecondary" accessibilityRole="text">
      {message}
    </ThemedText>
  );
}
