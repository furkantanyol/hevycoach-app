package expo.modules.healthexport

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android is not implemented: the export targets Apple Health only.
 * `isAvailable` returning false is what every caller gates on.
 */
class HealthExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HealthExport")

    Function("isAvailable") {
      false
    }
  }
}
