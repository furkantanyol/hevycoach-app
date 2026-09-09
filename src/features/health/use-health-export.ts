import { createHevyClient } from '@furkantanyol/hevy-client';
import { useCallback, useState } from 'react';

import { toHealthWorkout } from './to-health-workout';

import { getApiKey } from '@/features/settings/api-key';
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
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Save your Hevy API key first.');
      }

      await HealthExport.requestAuthorization();
      const client = createHevyClient({ apiKey });
      const { workouts } = await client.workouts.list({ pageSize: EXPORT_PAGE_SIZE });

      setResult(await HealthExport.exportWorkouts(workouts.map(toHealthWorkout)));
      setStatus('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('error');
    }
  }, []);

  return { run, status, result, error };
}
