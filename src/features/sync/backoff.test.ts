import { MAX_DELAY_MS, nextAttemptDelayMs } from './backoff';

describe('nextAttemptDelayMs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should double the ceiling on every attempt, starting at a second', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const delays = Array.from({ length: 5 }, (_, attempts) => nextAttemptDelayMs(attempts));

    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000]);
  });

  it('should stop doubling at the cap', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);

    expect(nextAttemptDelayMs(9)).toBe(MAX_DELAY_MS);
    expect(nextAttemptDelayMs(40)).toBe(MAX_DELAY_MS);
  });

  it('should spread the jitter across the whole window rather than pick one delay', () => {
    const delays = new Set(Array.from({ length: 50 }, () => nextAttemptDelayMs(6)));

    expect(delays.size).toBeGreaterThan(1);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_DELAY_MS);
  });
});
