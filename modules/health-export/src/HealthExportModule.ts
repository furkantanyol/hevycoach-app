import { NativeModule, requireNativeModule } from 'expo';

declare class HealthExportModule extends NativeModule<{}> {}

export default requireNativeModule<HealthExportModule>('HealthExport');
