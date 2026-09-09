import { loadStep } from './load-band';

const WEEK = [10, 20, 30, 40, 50];

describe('loadStep', () => {
  it('should have no band when the day has no session', () => {
    expect(loadStep(0, WEEK)).toBeNull();
  });

  it('should have no band when nothing is planned in the week', () => {
    expect(loadStep(12, [0, 0, 0])).toBeNull();
  });

  it('should draw the lightest session in the lightest band', () => {
    expect(loadStep(10, WEEK)).toBe(1);
  });

  it('should draw the heaviest session in the darkest band', () => {
    expect(loadStep(50, WEEK)).toBe(5);
  });

  it('should draw a middling session between the two', () => {
    expect(loadStep(30, WEEK)).toBe(3);
  });

  it('should draw every session the same when the week is even', () => {
    expect([20, 20, 20].map((volume, _, week) => loadStep(volume, week))).toEqual([3, 3, 3]);
  });

  it('should rank against the week rather than against an absolute scale', () => {
    expect(loadStep(20, [20, 21])).toBe(1);
    expect(loadStep(20, [19, 20])).toBe(5);
  });

  it('should ignore empty days when ranking', () => {
    expect(loadStep(10, [0, 10, 0, 20])).toBe(1);
  });
});
