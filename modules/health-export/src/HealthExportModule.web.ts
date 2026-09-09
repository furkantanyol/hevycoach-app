import { registerWebModule, NativeModule } from 'expo';

class HealthExportModule extends NativeModule<{}> {}

export default registerWebModule(HealthExportModule, 'HealthExportModule');
