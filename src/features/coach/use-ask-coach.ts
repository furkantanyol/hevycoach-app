import { useMutation } from '@tanstack/react-query';

import { askCoach, type AskCoachInput } from './client';

export function useAskCoach() {
  const { mutate, status, data, error } = useMutation({
    mutationFn: (input: AskCoachInput) => askCoach(input),
  });

  return {
    ask: mutate,
    status,
    answer: data ?? null,
    error: error?.message ?? null,
  };
}
