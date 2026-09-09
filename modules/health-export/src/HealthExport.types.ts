/** A Hevy workout flattened to what Apple Health stores. */
export type HealthWorkout = {
  id: string;
  title: string;
  /** ISO 8601 timestamp. */
  startTime: string;
  /** ISO 8601 timestamp. */
  endTime: string;
  /** Estimated active energy in kilocalories; 0 when there is no duration to estimate from. */
  energyKcal: number;
  /** Monotonic version; a higher value replaces an already-exported workout with the same id. */
  version: number;
};

export type ExportResult = {
  saved: number;
  skipped: number;
  failed: number;
};
