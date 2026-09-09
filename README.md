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
- TanStack Query reads Hevy directly, persisted for offline (see the amendment to
  [ADR 0002](docs/adr/0002-offline-sync.md))
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
