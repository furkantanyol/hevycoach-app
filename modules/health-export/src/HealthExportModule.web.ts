import { NativeModule, registerWebModule } from 'expo';

import type { ExportResult, HealthWorkout } from './HealthExport.types';

/** Apple Health has no web counterpart, so the module reports itself unavailable. */
class HealthExportModule extends NativeModule {
  isAvailable(): boolean {
    return false;
  }

  async requestAuthorization(): Promise<boolean> {
    return false;
  }

  async exportWorkouts(workouts: HealthWorkout[]): Promise<ExportResult> {
    return { saved: 0, skipped: 0, failed: workouts.length };
  }
}

export default registerWebModule(HealthExportModule, 'HealthExportModule');
