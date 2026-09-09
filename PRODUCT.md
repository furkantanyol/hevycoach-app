# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Primary user: Furkan, an experienced lifter who logs every session in Hevy and currently does his own
programming. Two situations, and they are not alike:

- **In the gym**, phone in one hand, twenty to ninety seconds between sets. He needs the next target
  and the reason it moved, at a glance. He is not reading; he is checking.
- **Between weeks**, at rest, deciding nothing himself. He wants to be told what changed and why.

Confirmed second audience: other lifters, publicly, later. The product must survive a user who is not
Furkan, which makes onboarding, error states, untrusted input and per-user rate limits real
requirements rather than polish.

## Product Purpose

HevyCoach reads a lifter's complete Hevy history and runs their training: it builds a block, tells
them what to do today, and adjusts week by week as they train.

The job it takes over is the whole cognitive burden of the gym, in the user's own words: what do I do
now, what should I improve, why is my bench not improving. He follows what it says and verifies it in
his own strength data. Success is that he stops programming and the numbers still go up.

That last part matters: the product owes diagnosis, not only prescription. "Your bench has not moved
in five weeks and here is why" is as much the deliverable as "do 87.5 kg for 5".

## Positioning

Two mechanisms a neighbouring app could not truthfully claim without doing the same work:

- **Every number is computed, never generated.** A deterministic rules engine on the device owns
  loads, progression, rep ranges, deloads, volume caps and stall detection. The language model
  proposes block structure and exercise selection from the user's own template library, and writes
  explanations. It never produces a working weight. Most AI coaching products cannot say this.
- **It runs on top of Hevy rather than replacing it.** The user keeps logging where they already log.
  The coach reads their real history, not a questionnaire, and writes routines back into the app they
  already open at the rack.

## Operating Context

- **Hevy stays the logger.** The user logs sets in Hevy during the session. HevyCoach never captures
  a set. Today is a read surface consulted between sets, so it must be one-handed and glanceable, and
  it must never compete for the set-logging moment.
- **Gyms have bad signal.** Today must be fully usable with no network. It is served from the
  generated block plus React Query's persisted cache, not from a device-side mirror of the history
  — see the 2026-09-09 amendment to ADR 0002 for the measurements that settled that.
- **The rhythm is weekly.** Sessions across the week, regeneration triggered after the last session
  of a week, at most two informational push notifications per week.
- **Writes go back to Hevy as routines**, currently prefixed `[TEST]` until the user lifts that guard.
- **Apple Health receives exported workouts** through a Swift module already verified on device.

## Capabilities and Constraints

- Six screens, finite: Onboarding, Today, Program, Week review, Lift detail, Settings.
- Onboarding is five questions and no more: goal (size / strength / both), days per week, experience,
  equipment, injuries or constraints as free text. It must never ask what the Hevy history answers.
- Pro gate is a single check: `GET /v1/user/info` returning 200 means Hevy Pro. Otherwise one screen
  linking to Hevy Pro. No other entitlement logic.
- The coaching prompt is fixed and server-side. Users get one free-text "coaching notes" field,
  injected as user context and treated as untrusted input. There is no user-editable system prompt.
- The Anthropic key never ships in the app. Identity is a hash of the user's Hevy key, rate limited
  per identity.
- Excluded on purpose: chat UI, pricing, daily notifications.
- TypeScript strict, zero `any`. Tests cover logic (progression, e1RM), not UI.

Explicitly undecided, and not to be invented:

- **Progression spec**: progression scheme, stall definition, deload trigger, weekly volume caps per
  muscle group, RPE autoregulation. Arriving from the user. The rules engine cannot be written first.
- **Design system**: tokens, type scale, dark and light, component set. Decided 2026-09-09: once the
  six screens are navigable with real data, two or three distinct visual directions are produced with
  one real screen rendered in each; the owner picks one or rejects all, and the winner becomes
  DESIGN.md. Until then screens stay unstyled. The visual world is not Hevy's, and Hevy screenshots
  remain an anti-reference for layout.
- **Accessibility standard** for the public release. No requirement has been set.

## Brand Commitments

- The product is called HevyCoach.
- **Hevy's UI must not be cloned.** Supplied Hevy screenshots are a craft reference for data density,
  tap-target sizing and dark-palette behaviour only. As layout they are an explicit anti-reference.
- The app has its own visual identity, defined by a design system that has not arrived yet.

## Evidence on Hand

- The user's real Hevy history: 275 workouts logged as of 2026-09-09, four routines in one folder,
  and body measurements including weight and body fat. This is the input the coaching is judged on.
- A live Hevy Pro account and API key, kept in a gitignored `.env`.
- Shipped and working: `@furkantanyol/hevy-client@1.0.0` and `hevy-coach@1.0.0` on npm, and a
  HealthKit export verified on a physical device. The offline sync engine was built, measured and
  deleted (ADR 0002 amendment).
- Hevy screenshots supplied as craft reference (statistics, exercise detail, active workout).

No customers, testimonials, benchmarks, press, pricing or deployment claims exist. Future work must
not fabricate them.

## Product Principles

1. **Numbers are computed, never generated.** If a model produced a working weight, the product has
   failed its own definition.
2. **The history is the input.** Never ask a user what their logged training already answers.
3. **Hevy keeps the set.** This app reads, decides and writes routines. It does not fight for the
   moment between the bar and the phone.
4. **Every number ends in a decision.** A metric on screen that does not resolve into what to do next,
   and why, does not earn its place.
5. **Quiet by design.** Two informational notifications a week, no chat, nothing that asks the user a
   question they came here to stop answering.
