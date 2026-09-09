# HevyCoach

Hevy data in, next week's routines out. Phase A is the foundation: your Hevy
history is pulled with the [Hevy client](https://www.npmjs.com/package/@furkantanyol/hevy-client)
and exported into Apple Health through a local Expo Module, idempotently.

## Stack

- Expo SDK 57, React Native 0.86, New Architecture, Expo Router (`src/app/`)
- TypeScript strict, pnpm
- `modules/health-export` — a local Expo Module writing workouts to HealthKit
  with `HKWorkoutBuilder` (see [ADR 0001](docs/adr/0001-expo-module-over-turbo-module.md))
- zustand + `expo-sqlite/kv-store` for settings, `expo-secure-store` for the API key
- Sentry, EAS Build and EAS Update

## Getting started

```sh
pnpm install
pnpm validate   # lint + typecheck + test
```

The app contains a local native module, so Expo Go will not run it. Build a
development client:

```sh
eas build --profile development --platform ios
npx expo start --dev-client
```

Or build locally against a simulator:

```sh
npx expo run:ios
```

`ios/` and `android/` are generated (CNG) and not committed.

## Environment

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN` | Enables Sentry. Sentry stays disabled when unset, which is the normal local-dev case. |
| `SENTRY_AUTH_TOKEN` | EAS secret, used only to upload source maps during a build. |

Set `organization` and `project` on the `@sentry/react-native/expo` plugin in
`app.json` before the first production build; they are placeholders today.

## Offline sync

Workout history lives in SQLite (Drizzle). A first run backfills every page of history and is
resumable: the page number is committed before the next page is fetched. After that, sync is a
delta against Hevy's `workouts/events` cursor, applying updates and tombstones in one transaction
and advancing the cursor only once that transaction commits.

Writes go the other way through an outbox table, oldest first, one at a time. A failure stops the
queue rather than letting a later write overtake it, and each retry backs off exponentially with
jitter. The outbox is a table rather than TanStack Query's paused mutations because paused
mutations cannot resume after an app restart without a registered default mutation function, and
surviving a restart is the whole point. See `docs/adr/0002-offline-sync.md`.

### Airplane-mode demo

On a physical device with a development build:

1. Settings, paste the Hevy API key, Save.
2. Sync, **Sync now**. Workout and set counts climb, the backfill page advances, the cursor fills in.
3. Turn on Airplane Mode. The network line flips to Offline.
4. Pick a routine, type a new title, **Queue rename**. The name changes locally and Queued goes to 1.
5. **Sync now** while offline. It reports that nothing was lost, Queued stays 1, no retry is spent.
6. Force-quit and relaunch. Queued is still 1.
7. Airplane Mode off, **Sync now**. Queued drops to 0 and the routine is renamed in Hevy.

Routine writes are prefixed `[TEST]` on purpose while the app is under construction.

## Health export

Open **Settings**, paste your Hevy API key (it is stored in the keychain and
never logged), turn on **Export to Apple Health** and run the export. The last
10 workouts are mapped and handed to the native module, which skips anything
already in Apple Health at the same or a newer version, so re-running is safe.

HealthKit only writes on a real device — on the simulator the module reports
itself available but saves will fail.

### Building for a physical iPhone

Fully local, about five minutes, no Xcode-to-device deploy needed:

```bash
pnpm ios:build                         # eas build --local, development profile, writes build/hevycoach-dev.ipa
DEVICE_ID=$(xcrun xctrace list devices | grep -oE '\(0000[0-9A-F-]+\)' | tr -d '()' | head -1)
DEVICE_ID=$DEVICE_ID pnpm ios:install  # xcrun devicectl installs the ad-hoc .ipa
npx expo start --dev-client            # the dev client connects to Metro over Wi-Fi
```

`devicectl device install` works even when Xcode has no developer disk image for the phone's iOS version (which is what breaks `expo run:ios --device`). Cloud alternative: `eas build --profile development --platform ios`, then install from the link EAS prints. Source-map upload to Sentry is disabled in every profile until `organization`, `project` and a `SENTRY_AUTH_TOKEN` secret are set.
