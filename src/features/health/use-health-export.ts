import { type HevyClient } from '@furkantanyol/hevy-client';
import { useCallback, useState } from 'react';

import { toHealthWorkout } from './to-health-workout';

import { hevyClient } from '@/features/hevy/client';
import { HealthExport, type ExportResult } from '@/modules/health-export';

/** Hevy caps the workouts page at 10. */
const EXPORT_PAGE_SIZE = 10;

export type ExportStatus = 'idle' | 'running' | 'done' | 'error';

export function useHealthExport() {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setStatus('running');
    setResult(null);
    setError(null);

    try {
      const client = await hevyClient();

      await HealthExport.requestAuthorization();
      const bodyweightKg = await latestBodyweightKg(client);
      const { workouts } = await client.workouts.list({ pageSize: EXPORT_PAGE_SIZE });

      setResult(
        await HealthExport.exportWorkouts(
          workouts.map((workout) => toHealthWorkout(workout, bodyweightKg)),
        ),
      );
      setStatus('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('error');
    }
  }, []);

  return { run, status, result, error };
}

/**
 * Newest measurement that recorded a weight; measurements are listed newest first and only some of
 * them carry one. The energy estimate is the only thing this feeds, so a missing or unreachable
 * bodyweight returns null and the export goes ahead without an energy figure rather than failing.
 */
async function latestBodyweightKg(client: HevyClient): Promise<number | null> {
  try {
    const page = await client.bodyMeasurements.list({ pageSize: EXPORT_PAGE_SIZE });
    const weighed = page.body_measurements.find(
      (measurement) => typeof measurement.weight_kg === 'number',
    );
    return weighed?.weight_kg ?? null;
  } catch {
    return null;
  }
}
