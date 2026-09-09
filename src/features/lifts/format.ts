import type { RoutineSet } from '@furkantanyol/hevy-client';

const NOTHING_RECORDED = '—';

/** The device locale decides the format; the app never hardcodes one. */
export function formatDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString();
}

/** The fields a logged set carries, whether it came from a workout or from exercise history. */
type LoggedSet = {
  readonly weight_kg: number | null;
  readonly reps: number | null;
  readonly duration_seconds: number | null;
  readonly distance_meters: number | null;
  readonly rpe: number | null;
};

function join(parts: readonly (string | null)[]): string {
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? NOTHING_RECORDED : present.join(' · ');
}

/** What the user logged, exactly as they logged it. */
export function describeLoggedSet(set: LoggedSet): string {
  return join([
    set.weight_kg === null ? null : `${set.weight_kg} kg`,
    set.reps === null ? null : `${set.reps} reps`,
    set.duration_seconds === null ? null : `${set.duration_seconds}s`,
    set.distance_meters === null ? null : `${set.distance_meters} m`,
    set.rpe === null ? null : `RPE ${set.rpe}`,
  ]);
}

function describeTargetReps(set: RoutineSet): string | null {
  const { start, end } = set.rep_range ?? { start: null, end: null };
  if (start !== null || end !== null) {
    return `${start ?? '?'}–${end ?? '?'} reps`;
  }
  return set.reps === null ? null : `${set.reps} reps`;
}

/**
 * The target Hevy already stores on the routine. This app never derives a target — that is the
 * rules engine's job, and its spec has not landed.
 */
export function describeTargetSet(set: RoutineSet): string {
  return join([set.weight_kg === null ? null : `${set.weight_kg} kg`, describeTargetReps(set)]);
}

const KILOGRAM_DECIMALS = 10;

/** One decimal, because an estimate carrying three is pretending to a precision it does not have. */
export function formatKilograms(weightKg: number): string {
  return `${Math.round(weightKg * KILOGRAM_DECIMALS) / KILOGRAM_DECIMALS} kg`;
}

const NORMAL_SET = 'normal';

function describeTargetRun(set: RoutineSet, count: number): string {
  const target = describeTargetSet(set);
  const kind = set.type === NORMAL_SET ? '' : `${set.type} `;
  return `${count} × ${kind}${target}`;
}

/**
 * The routine's own targets, with identical consecutive sets collapsed — "3 × 100 kg · 8 reps"
 * rather than the same line three times. Still Hevy's numbers; nothing is derived.
 */
export function describeTargetSets(sets: readonly RoutineSet[]): string {
  const runs: { set: RoutineSet; count: number }[] = [];

  for (const set of sets) {
    const previous = runs.at(-1);
    const sameAsPrevious =
      previous !== undefined &&
      previous.set.type === set.type &&
      describeTargetSet(previous.set) === describeTargetSet(set);

    if (sameAsPrevious) {
      previous.count += 1;
    } else {
      runs.push({ set, count: 1 });
    }
  }

  if (runs.length === 0) {
    return NOTHING_RECORDED;
  }
  return runs.map((run) => describeTargetRun(run.set, run.count)).join(', ');
}
