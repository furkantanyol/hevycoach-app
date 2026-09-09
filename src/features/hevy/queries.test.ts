import { hevyQueryKeys, resetHevyQueries } from './queries';

import { queryClient } from '@/lib/query-client';

const CONTEXT_DAYS = 7;

describe('resetHevyQueries', () => {
  it('should drop cached workouts so a re-keyed device cannot serve the previous account', () => {
    queryClient.setQueryData(hevyQueryKeys.recentWorkouts(CONTEXT_DAYS), [
      { id: 'workout-from-the-previous-account' },
    ]);

    resetHevyQueries();

    expect(queryClient.getQueryData(hevyQueryKeys.recentWorkouts(CONTEXT_DAYS))).toBeUndefined();
  });
});
