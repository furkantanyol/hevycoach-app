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
