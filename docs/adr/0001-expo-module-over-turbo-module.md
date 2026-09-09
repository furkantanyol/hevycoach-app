# 1. An Expo Module, not a Turbo Module, for the Apple Health export

- Status: accepted
- Date: 2026-09-09

## Context

The app has to write Hevy workouts into Apple Health. HealthKit is iOS-only and
its API is async and Objective-C/Swift-first, so this needs native code. The two
realistic options in an Expo SDK 57 / React Native 0.86 app on the New
Architecture are a Turbo Module or a local Expo Module.

## Decision

Use a local Expo Module (`modules/health-export`).

- The Swift DSL (`Name`, `Function`, `AsyncFunction`, `Record`) is the whole
  bridge. There is no codegen spec to keep in sync with the TypeScript types,
  and no C++ glue to read during a code review.
- Local modules under `modules/` autolink. Nothing is added to `app.json`, and
  the module is prebuilt by EAS like any other dependency.
- `AsyncFunction` closures take Swift `async`/`await` bodies directly, which is
  what the HealthKit API wants. A Turbo Module would need the promise plumbed
  through by hand.
- `Record` structs give typed argument and return marshalling in both
  directions, so `HealthWorkout` and `ExportResult` are declared once per side.

The cost is that the module is tied to Expo's module runtime rather than to
bare React Native. That is not a real constraint here: the app is an Expo app.

## Threading model

- `AsyncFunction` bodies run off the JS thread by default, so the export never
  blocks rendering. `.runOnQueue(.main)` is not used because nothing touches UI.
- HealthKit resumes its completion handlers on arbitrary background queues, so
  each `await` in the module may continue on a different queue. The module keeps
  no queue-affine state.
- One `HKHealthStore` is held for the module's lifetime, as HealthKit requires a
  long-lived store instance.
- Results are marshalled back to JS by the Expo module runtime; the module does
  not hop threads itself.

## Idempotency design

Exporting is expected to be run repeatedly, so it must converge rather than
duplicate.

- Every workout is saved with `HKMetadataKeySyncIdentifier` = `hevy:<workout id>`
  and `HKMetadataKeySyncVersion`. HealthKit requires the two together, and a save
  with the same identifier and a *higher* version replaces the stored object.
- Equal-version behaviour is not documented, so the module does not rely on it.
  It queries first — `HKSampleQuery` over `HKObjectType.workoutType()` with
  `HKQuery.predicateForObjects(withMetadataKey:allowedValues:)` for the whole
  batch — and skips any workout whose stored version is greater than or equal to
  the incoming one. This is also why the module asks for HealthKit *read*
  access, not only share access.
- The version is the Hevy `updated_at` timestamp in epoch seconds. Editing a
  workout in Hevy raises it, so the edit is re-exported and replaces the old
  entry; re-running an unchanged export is a no-op.
- `HKMetadataKeyExternalUUID` carries the raw Hevy id as a tag for anyone
  inspecting the data. It does not de-duplicate on its own and is not used for
  that.
- Residual gap: HealthKit never reports read-authorization status, so if the
  user grants write but denies read for Workouts, the dedupe query returns
  nothing and re-exports fall back to HealthKit's own sync-version replacement
  (higher version replaces; equal version undocumented). Accepted for now.

## Consequences

- The export can be run from the Settings screen as often as the user likes; the
  result is reported as `{ saved, skipped, failed }`.
- One failed workout does not abort the batch — it is counted in `failed` and
  logged through `OSLog`.
- Android is a compiling stub whose `isAvailable()` returns `false`, and the web
  module returns the same. Every caller gates on `isAvailable()`.
- HealthKit writes only work on a real device, so this cannot be verified end to
  end on the simulator.
