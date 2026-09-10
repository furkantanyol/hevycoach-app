# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Primary user: Furkan, the owner. An experienced lifter who logs every session in Hevy (275 workouts and body measurements as of 2026-09-09) and has been programming himself. Single user for now; multi-user and accounts are out of scope for v1 (`docs/spec.md`).

Situations, in order of frequency:

- **Seconds after finishing a workout in Hevy.** A push arrives with the coach's verdict. He reads it on the phone, probably still at the gym or walking out, and answers its one question.
- **Between sessions.** He opens the thread to ask a training question or to tell the coach something changed (schedule, pain, equipment).
- **First contact.** The coach runs intake in the chat: goal, days per week, experience, equipment, injuries or constraints. One or two questions per message. It never asks what the history already answers.

Second audience, once: an interviewer on 2026-09-11 16:00 (Europe/Madrid). The demo is screen-shared; the simulator may be the vehicle, but the loop is verified on the owner's device. After the interview the product is the owner's daily coach.

## Product Purpose

A coach that lives on top of Hevy. The user keeps logging in Hevy. The coach reads the whole history, asks what the history cannot answer, writes a training block into the user's Hevy account as routines, judges every finished workout within seconds through Hevy's webhook, pushes a short verdict that ends with one question, and answers training questions in a chat.

Success: the demo loop runs end to end on 2026-09-11 (chat → plan → routines in Hevy → workout → push → reply), and after that the owner stops programming himself and keeps training on what the coach writes.

## Positioning

- **It runs on top of Hevy rather than replacing it.** The coach reads the real logged history, not a questionnaire, and writes routines back into the app the user already opens at the rack. Hevy stays the logger and the viewer.
- **It judges every workout within seconds of it ending**, through Hevy's webhook, with one verdict and one question. Nothing scheduled, nothing daily.
- **The model produces the numbers; a server-side guard bounds them** before anything is written to Hevy. This deliberately reverses the earlier "every number is computed, never generated" thesis (ADR 0001). If the numbers prove unreliable, the guard becomes a rules engine.

## Operating Context

- **Hevy keeps the set and the routine.** During a session the user is in Hevy, following a routine the coach wrote into the "HevyCoach" folder. The thread is never consulted between sets and never shows the next target; it is the conversation around the training, not the training.
- **The app has four tabs** (Coach, Plan, Progress, Profile) and a native onboarding flow, decided 2026-09-10 16:30 after the thread alone read as thin. It stores nothing; every tab reads the server. Verdicts written while the app was closed appear when it comes to the foreground.
- **Push is the front door.** A verdict push carries the session name as title and the message as body (truncated to ~170 characters). Tapping it opens the thread.
- **The coach is a small Fastify server** the owner runs locally, reachable through a Cloudflare Tunnel at `coach.furkantanyol.com`, state in one JSON file. Runs on the owner's Mac for the demo, on a Hetzner box afterwards.
- **Reference implementation of the mechanics**: the owner's Telegram coach `furkan-ai` on a VPS (`docs/research/furkan-ai-coaching-mechanics.md`) and the methodology in `hevy-coach/prompts/COACH.md`.

## Capabilities and Constraints

Confirmed (`docs/spec.md`, approved 2026-09-10):

- The thread streams the coach's reply. History loads on mount and on foreground. Intake is a native onboarding flow of six steps with selectable options, prefilled from Hevy wherever the history answers (bodyweight, days per week, session length, years training, equipment); the chat is for questions and changes.
- `create_program` is the only write. Routines go into the "HevyCoach" folder of the owner's account and nowhere else; existing routines outside it are never touched.
- Scope: training, recovery, mobility, and nutrition as it relates to training. Anything else gets one line declining and a redirect.
- Safety: pain or injury → ask where, when, how bad, then program conservatively. Red flags → tell them to see a professional. No diagnoses.
- All user-written text is untrusted input to the model. The model can only reach Hevy through the one guarded tool.
- Terminology: **block** (a 4–6 week mesocycle), **session** (one routine in the block), **plan** (the message that introduces a block), **verdict** (the judgement of one finished workout), **intake** (the first-contact questions), **memory** (the coach's rolling notes), **template** (a Hevy exercise).
- Stack: Expo SDK 57, React Native 0.86, New Architecture, expo-router, `@assistant-ui/react-native`, TypeScript strict. The dependency list in the spec is closed; nothing else gets added without a reason. Light and dark both ship (`userInterfaceStyle: automatic`, dark splash variant).
- Tests cover server logic only. No UI tests.
- Out of scope for v1: multi-user, accounts, encrypted key storage, rate limits, Apple Health, offline mirror, daily scheduled pushes, Android, web.

Explicitly undecided, not to be invented:

- **Accessibility standard.** None has been set.
- **Audience after the owner.** Not decided beyond "out of scope for v1".

## Brand Commitments

- The product is called HevyCoach.
- **The coach's voice is binding** (spec section 3, from `furkan-ai`): lead with the one thing that matters; two to five short lines; no headers, no bullet walls; one question max; truth over diplomacy; call out a miss once, as a line; celebrate wins equally; never nag. The venture brief's number-one risk is "the proactive coach became a nag"; the surface must not undo the voice with its own noise.
- Assets on hand: `assets/images/icon.png`, `splash-icon.png`, `splash-icon-dark.png`. Splash backgrounds `#FFFFFF` light, `#0C0C0C` dark. No wordmark, no logo beyond the icon.
- The previous visual world ("The Block Chart": paper-white, hairlines, one marker colour) was deleted with the reset and does not bind.
- **The app sits alongside Hevy and looks like it belongs there** (owner, 2026-09-10, during the direction round): same appearance family as Hevy's screens, very simple, native controls, no invented chrome. Hevy is the reference, not an anti-reference; this reverses the previous record. Hevy's craft level is the bar. The owner's Hevy screenshots are the source of exact values.

## Evidence on Hand

- The owner's real Hevy history: 275 workouts and body measurements as of 2026-09-09. This is the input the coaching is judged on.
- A live Hevy Pro account and API key, in gitignored `.env` files.
- Shipped: `@furkantanyol/hevy-client@1.0.0` and `hevy-coach@1.0.0` (MCP server) on npm, CI green.
- A running Telegram coach (`furkan-ai`) whose feedback voice this product adopts.
- Hevy screenshots from the owner's phone, light appearance, at `docs/IMG_2406.PNG` to `docs/IMG_2410.PNG` (routines list, routine detail, active workout, profile, home feed). They are the source of Hevy's values and are gitignored because they carry the owner's and other users' photos.
- Not yet recorded: the real Hevy webhook delivery contract. The first delivery is logged in full and goes into `docs/hevy-webhook-delivery.md`.

No customers, testimonials, benchmarks, press, pricing, or deployment claims exist. Future work must not fabricate them.

## Product Principles

1. **Hevy keeps the set.** This product reads, decides, writes routines, and talks. It never competes for the moment between the bar and the phone.
2. **The history is the input.** Never ask what the logged training already answers.
3. **The model proposes, the guard disposes.** Nothing reaches Hevy that the guard has not bounded.
4. **One thing that matters, one question.** Every message, push, and screen element earns its place by that rule. Silence beats a reminder.
5. **Delete rather than keep dormant.** Whatever does not serve the chat → plan → workout → verdict loop leaves the codebase (ADR 0001).
