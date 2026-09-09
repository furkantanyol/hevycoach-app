import type { RoutineSet } from '@furkantanyol/hevy-client';

import { countFigure, loadFigure, repsFigure, targetRepsFigure } from './figures';

function set(reps: number | null, repRange?: RoutineSet['rep_range']): RoutineSet {
  return {
    index: 0,
    type: 'normal',
    weight_kg: 100,
    reps,
    rep_range: repRange ?? null,
    distance_meters: null,
    duration_seconds: null,
    rpe: null,
    custom_metric: null,
  };
}

describe('loadFigure', () => {
  it('should print one number when every set carries the same load', () => {
    expect(loadFigure([100, 100, 100])).toBe('100');
  });

  it('should print the span when the loads differ', () => {
    expect(loadFigure([80, 100])).toBe('80–100');
  });

  it('should trim to one decimal, because more is a precision the number does not have', () => {
    expect(loadFigure([102.55])).toBe('102.6');
  });

  it('should have no figure when nothing was loaded', () => {
    expect(loadFigure([null, null])).toBeNull();
  });

  it('should ignore a set carrying no load at all', () => {
    expect(loadFigure([0, 60])).toBe('60');
  });
});

describe('targetRepsFigure', () => {
  it('should print sets by reps', () => {
    expect(targetRepsFigure([set(8), set(8), set(8)])).toBe('3 × 8');
  });

  it('should print the span when the sets ask for different reps', () => {
    expect(targetRepsFigure([set(5), set(8)])).toBe('2 × 5–8');
  });

  it('should print the routine own rep range when it stores one', () => {
    expect(targetRepsFigure([set(null, { start: 6, end: 10 })])).toBe('1 × 6–10');
  });

  it('should have no figure when the routine stores no reps', () => {
    expect(targetRepsFigure([set(null)])).toBeNull();
  });

  it('should have no figure when there are no sets', () => {
    expect(targetRepsFigure([])).toBeNull();
  });
});

describe('countFigure', () => {
  it('should print a count that happened', () => {
    expect(countFigure(3)).toBe('3');
  });

  it('should leave the column open when nothing was counted', () => {
    expect(countFigure(0)).toBeNull();
  });
});

describe('repsFigure', () => {
  it('should print the sets logged by the reps they were logged at', () => {
    expect(repsFigure(3, [8, 8, 8])).toBe('3 × 8');
  });

  it('should print the span when the reps fell away across the sets', () => {
    expect(repsFigure(3, [8, 7, 5])).toBe('3 × 5–8');
  });

  it('should have no figure when nothing was logged', () => {
    expect(repsFigure(0, [])).toBeNull();
  });
});
