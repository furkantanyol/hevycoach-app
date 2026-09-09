import { NativeModule, requireNativeModule } from 'expo';

import type { ExportResult, HealthWorkout } from './HealthExport.types';

declare class HealthExportModule extends NativeModule {
  isAvailable(): boolean;
  requestAuthorization(): Promise<boolean>;
  exportWorkouts(workouts: HealthWorkout[]): Promise<ExportResult>;
}

export default requireNativeModule<HealthExportModule>('HealthExport');
