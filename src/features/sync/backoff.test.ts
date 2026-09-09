import { MAX_ATTEMPTS, MAX_DELAY_MS, nextAttemptDelayMs } from './backoff';

describe('nextAttemptDelayMs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should grow with every attempt when the jitter is held still', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const delays = Array.from({ length: MAX_ATTEMPTS }, (_, attempts) =>
      nextAttemptDelayMs(attempts)
    );

    expect(delays).toEqual([...delays].sort((left, right) => left - right));
  });

  it('should stop growing once it reaches the cap', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);

    expect(nextAttemptDelayMs(20)).toBe(nextAttemptDelayMs(40));
  });

  it('should never exceed the cap, whatever the jitter', () => {
    const delays = Array.from({ length: 500 }, (_, attempt) => nextAttemptDelayMs(attempt % 30));

    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_DELAY_MS);
  });
});
