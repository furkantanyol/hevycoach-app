/** A Hevy workout flattened to what Apple Health stores. */
export type HealthWorkout = {
  id: string;
  title: string;
  /** ISO 8601 timestamp. */
  startTime: string;
  /** ISO 8601 timestamp. */
  endTime: string;
  /** Estimated active energy in kilocalories; null when there is nothing honest to estimate from. */
  energyKcal: number | null;
  /** Monotonic version; a higher value replaces an already-exported workout with the same id. */
  version: number;
};

export type ExportResult = {
  saved: number;
  skipped: number;
  failed: number;
};
