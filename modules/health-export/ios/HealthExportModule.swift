import ExpoModulesCore
import HealthKit
import OSLog

// Threading model:
// - `AsyncFunction` bodies run off the JS thread, so nothing here blocks JS; no UI is touched.
// - HealthKit resumes its callbacks on arbitrary background queues, so every `await` below may
//   continue on a different queue; no state is queue-affine and results are marshalled back by
//   the Expo module runtime.
// - One `HKHealthStore` is kept for the module's lifetime, as HealthKit requires a long-lived store.

private let syncIdentifierPrefix = "hevy:"
private let hevyTitleMetadataKey = "HevyWorkoutTitle"

private let logger = Logger(subsystem: "com.furkantanyol.hevycoach", category: "HealthExport")

private let isoFormatter = ISO8601DateFormatter()
private let isoFractionalFormatter: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter
}()

struct HealthWorkoutRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  /// ISO 8601 timestamp.
  @Field var startTime: String = ""
  /// ISO 8601 timestamp.
  @Field var endTime: String = ""
  /// Monotonic version; a higher value replaces an already-exported workout with the same id.
  @Field var version: Int = 0
}

struct ExportResult: Record {
  @Field var saved: Int = 0
  @Field var skipped: Int = 0
  @Field var failed: Int = 0
}

internal final class HealthDataUnavailableException: Exception {
  override var reason: String {
    "Apple Health is not available on this device"
  }
}

internal final class NotAuthorizedException: Exception {
  override var reason: String {
    "Writing workouts to Apple Health is not authorized"
  }
}

internal final class InvalidTimestampException: GenericException<String> {
  override var reason: String {
    "Not an ISO 8601 timestamp: \(param)"
  }
}

public class HealthExportModule: Module {
  private let healthStore = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("HealthExport")

    Function("isAvailable") {
      HKHealthStore.isHealthDataAvailable()
    }

    AsyncFunction("requestAuthorization") { () async throws -> Bool in
      try self.assertAvailable()
      let workoutType = HKObjectType.workoutType()
      // Read access is needed for the de-duplication query in `exportWorkouts`.
      try await self.healthStore.requestAuthorization(toShare: [workoutType], read: [workoutType])
      return self.healthStore.authorizationStatus(for: workoutType) == .sharingAuthorized
    }

    AsyncFunction("exportWorkouts") { (workouts: [HealthWorkoutRecord]) async throws -> ExportResult in
      try self.assertAvailable()
      guard self.healthStore.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else {
        throw NotAuthorizedException()
      }

      let storedVersions = try await self.storedVersions(for: workouts.map(syncIdentifier))
      var result = ExportResult()

      for workout in workouts {
        let identifier = syncIdentifier(for: workout)
        if let storedVersion = storedVersions[identifier], storedVersion >= workout.version {
          result.skipped += 1
          continue
        }
        do {
          try await self.save(workout, as: identifier)
          result.saved += 1
        } catch {
          // One bad workout must not abort the batch; the caller sees it in `failed`.
          logger.error("Failed to export \(identifier, privacy: .public): \(error.localizedDescription)")
          result.failed += 1
        }
      }

      return result
    }
  }

  private func assertAvailable() throws {
    guard HKHealthStore.isHealthDataAvailable() else {
      throw HealthDataUnavailableException()
    }
  }

  /// Highest sync version already in Apple Health, per sync identifier.
  private func storedVersions(for identifiers: [String]) async throws -> [String: Int] {
    guard !identifiers.isEmpty else {
      return [:]
    }

    let predicate = HKQuery.predicateForObjects(
      withMetadataKey: HKMetadataKeySyncIdentifier,
      allowedValues: identifiers
    )
    let samples: [HKSample] = try await withCheckedThrowingContinuation { continuation in
      let query = HKSampleQuery(
        sampleType: HKObjectType.workoutType(),
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: nil
      ) { _, samples, error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: samples ?? [])
        }
      }
      self.healthStore.execute(query)
    }

    return samples.reduce(into: [String: Int]()) { versions, sample in
      guard
        let identifier = sample.metadata?[HKMetadataKeySyncIdentifier] as? String,
        let version = sample.metadata?[HKMetadataKeySyncVersion] as? NSNumber
      else {
        return
      }
      versions[identifier] = max(versions[identifier] ?? Int.min, version.intValue)
    }
  }

  private func save(_ workout: HealthWorkoutRecord, as identifier: String) async throws {
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining

    let builder = HKWorkoutBuilder(
      healthStore: healthStore,
      configuration: configuration,
      device: .local()
    )
    try await builder.beginCollection(at: parseTimestamp(workout.startTime))
    // Sync identifier and version must be set together; a higher version replaces the stored workout.
    try await builder.addMetadata([
      HKMetadataKeySyncIdentifier: identifier,
      HKMetadataKeySyncVersion: NSNumber(value: workout.version),
      HKMetadataKeyExternalUUID: workout.id,
      hevyTitleMetadataKey: workout.title
    ])
    try await builder.endCollection(at: parseTimestamp(workout.endTime))
    // `finishWorkout` returns nil on success while the device is locked, which is not an error.
    _ = try await builder.finishWorkout()
  }
}

private func syncIdentifier(for workout: HealthWorkoutRecord) -> String {
  syncIdentifierPrefix + workout.id
}

private func parseTimestamp(_ value: String) throws -> Date {
  if let date = isoFormatter.date(from: value) {
    return date
  }
  if let date = isoFractionalFormatter.date(from: value) {
    return date
  }
  throw InvalidTimestampException(value)
}
