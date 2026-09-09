import type { RoutineSet } from '@furkantanyol/hevy-client';

/**
 * The figures a ruled table puts in its columns. Every one of them is read straight out of Hevy —
 * a routine's own stored target, or a set the lifter logged — and formatted to fit a column at
 * arm's length. Nothing here decides anything: loads, rep ranges and progression belong to the
 * rules engine, which does not exist yet.
 *
 * The unit lives in the column's stamp rather than in every cell, so the digits line up.
 */
const RANGE = '–';
const TIMES = '×';
const LOAD_DECIMALS = 10;

function number(value: number): string {
  return String(Math.round(value * LOAD_DECIMALS) / LOAD_DECIMALS);
}

function span(values: readonly number[]): string | null {
  if (values.length === 0) {
    return null;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? number(low) : `${number(low)}${RANGE}${number(high)}`;
}

/** The load column: one number when every set carries the same, the span when they differ. */
export function loadFigure(loads: readonly (number | null)[]): string | null {
  return span(loads.filter((load): load is number => load !== null && load > 0));
}

function repBounds(set: RoutineSet): number[] {
  const { start, end } = set.rep_range ?? { start: null, end: null };
  if (start !== null || end !== null) {
    return [start, end].filter((bound): bound is number => bound !== null);
  }
  return set.reps === null ? [] : [set.reps];
}

/** Sets by reps: "3 × 8", or "3 × 6–8" when they are not all the same. */
export function repsFigure(count: number, reps: readonly (number | null)[]): string | null {
  const spanned = span(reps.filter((rep): rep is number => rep !== null && rep > 0));
  return count === 0 || spanned === null ? null : `${count} ${TIMES} ${spanned}`;
}

/** The same figure for a routine's own stored targets, rep ranges included. */
export function targetRepsFigure(sets: readonly RoutineSet[]): string | null {
  return repsFigure(sets.length, sets.flatMap(repBounds));
}

/** A count that only prints when there is something to count. */
export function countFigure(count: number): string | null {
  return count > 0 ? String(count) : null;
}
