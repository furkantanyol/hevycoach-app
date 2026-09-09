# 3. Estimated active energy on exported workouts

- Status: accepted
- Date: 2026-09-09

## Context

Every Hevy workout HevyCoach writes to Apple Health arrives with no energy at
all, and Health renders that as `0 kcal`. It is not a cosmetic problem: the Move
ring and the Fitness app's daily totals are built from active-energy samples, so
a workout with none is a workout that, as far as the rest of the health picture
is concerned, did not happen. Every other app writing to Health — Apple's own
Workout app included — contributes energy, and the Hevy sessions sit next to
them looking free.

Hevy does not record energy and does not know the lifter's heart rate; the phone
is in a pocket, not on the bar. There is no measurement to import. The options
are to keep writing nothing, or to write an estimate and say clearly that it is
one.

## Decision

Write an estimate, derived from METs.

The metabolic equivalent is the standard way to price an activity when nothing
was measured: one MET is approximately one kcal per kilogram of bodyweight per
hour. The Compendium of Physical Activities puts resistance training at roughly
3.5 METs for a light, long-rest session and around 6 METs for vigorous work.

```
MET  = 3.5 + (clamp(avgRpe, 6, 10) - 6) / (10 - 6) * (6 - 3.5)
kcal = round(MET × bodyweightKg × durationHours)
```

A 60-minute session logged at an average RPE 8 for an 80 kg lifter is
`4.75 METs × 80 kg × 1 h = 380 kcal`.

### The RPE mapping is deliberately crude

Hevy logs RPE per set, from 6 to 10 in half steps, and that is the only signal
in the data about how hard the session actually was. Mapping it linearly onto
the 3.5–6 MET band means an RPE 6 session is priced as light work and an RPE 10
session as vigorous work, with everything in between interpolated. Warmup sets
are excluded — they are not the effort the band describes — and sets with no RPE
are ignored. A workout that logged no RPE anywhere takes the midpoint, 4.75.

This is not physiology. Rest periods, the loads moved, the muscle mass involved
and the lifter's training age all move real energy expenditure and none of them
are inputs here. A better model is possible; it needs data the export does not
have. The point of this one is that it is defensible, monotonic in the one
signal available, and honest about being an estimate. It is not tuned, and it
should not be tuned without something to tune against.

### Bodyweight comes from Hevy, and only from Hevy

The estimate is per kilogram, so it needs a bodyweight. The export reads the
newest Hevy body measurement carrying a `weight_kg` (`bodyMeasurements.list`
returns newest first) and uses that.

**Amended 2026-09-10.** This originally fell back to a hardcoded 80 kg when the
call failed or the lifter had never recorded a weight, on the grounds that an
estimate 20% off beats a zero. That reasoning holds for a number shown on our
own screen and fails for one written into Apple Health, which is an external
record other apps read as fact — nothing on the export screen told the lifter
that a particular run had been priced against a body that was not theirs.

So the fallback is gone. `latestBodyweightKg` returns `null` when Hevy holds no
weight or the call fails, `estimateEnergyKcal` returns `null` for a null
bodyweight, and the native record already treats a nil `energyKcal` as "write no
energy sample". The export still succeeds; the workout simply arrives without an
energy figure, which is the same place it was before this ADR. Recording a
weight in Hevy is what turns the estimate on, and the settings copy says so.

## Tagging the estimate in HealthKit

The energy is written as its own `HKQuantitySample` of type
`.activeEnergyBurned`, added to the `HKWorkoutBuilder` between `beginCollection`
and `finishWorkout`. `HKWorkout.totalEnergyBurned` is deprecated as of iOS 18;
energy is read back through `HKWorkout.statistics(for:)`, which reads the
samples, so the sample is the thing that matters.

Unlike `beginCollection`, `addMetadata` and `endCollection`, `HKWorkoutBuilder`'s
`add(_:)` ships no `async` overlay — only the completion-handler form — so it is
wrapped in a `withCheckedThrowingContinuation`, the same bridge the module
already uses for `HKSampleQuery`. A `false` result with no error is treated as a
failure rather than swallowed, so a rejected sample shows up in the export's
`failed` count instead of producing a workout that silently has no energy.

### `HKMetadataKeyWasUserEntered` is the wrong key

The obvious-looking key is wrong. `HKMetadataKeyWasUserEntered` means the value
was entered manually *by the user*. Nobody typed 380 kcal into anything; the app
computed it. Using that key would misreport where the number came from to every
other app reading the sample, which is a worse failure than the sample being
untagged.

Apple documents no general "this value is an estimate" key.
(`HKMetadataKeySessionEstimate` exists, but its semantics could not be verified
against the documentation, so it is not used.) What Apple does document, on
`HKObject.metadata`, is that apps may define their own keys, with values
restricted to `NSString`, `NSNumber` and `NSDate`.

So the sample and the workout both carry:

| Key | Value |
| --- | --- |
| `HevyCoachEnergyEstimated` | `NSNumber(value: true)` |
| `HevyCoachEnergyMethod` | `"MET"` |

Plain prefixed keys, not reverse-DNS: Apple documents no convention for custom
keys, and the prefix is enough to keep them out of the way. The workout carries
the same pair as the sample so a reader that only looks at the workout still
learns the energy was estimated and how.

## `EXPORT_FORMAT_VERSION` and the idempotency rule

The export is idempotent through `HKMetadataKeySyncIdentifier` (`hevy:<id>`) and
`HKMetadataKeySyncVersion`: HealthKit replaces a stored object only when the same
sync identifier is saved again with a **strictly higher** sync version. The
version has been the Hevy `updated_at` in epoch seconds, so editing a workout in
Hevy re-exports it and re-exporting an untouched one is a no-op.

That rule is exactly what would have stranded this change. Workouts already in
Health have a stored version, and Hevy has no reason to touch their `updated_at`
— so they would have kept their `0 kcal` forever while only newly logged
workouts got an estimate.

Hence:

```ts
version = updatedAtEpochSeconds + EXPORT_FORMAT_VERSION;
```

Bumping the constant lifts every workout's version by one, past whatever the
previous export stored, and the next run replaces them all. It is the migration
mechanism for anything that changes the *shape* of what we write to Health, and
it costs one re-export of the last 10 workouts. Bump it when what we write
changes; do not bump it for changes that only affect which workouts are sent.

One thing to watch on the first bump: whether replacing a workout also removes
the energy sample the previous export attached to it. Samples added through
`HKWorkoutBuilder` belong to the workout, so they should go with it, but that is
not something Apple's documentation states outright and it has not been checked
against a real Health database. If a re-export ever leaves the Move ring
double-counting a session, that is the reason.
