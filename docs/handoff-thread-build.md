# Hand-off for the thread build (impeccable new-work), 2026-09-10 evening

The plumbing under `src/` is committed and runs on the simulator against the live server. The thread build restyles it against `.impeccable/surfaces/src-app-index-tsx.md`; it should not have to touch the data path.

## What exists

- `src/app/index.tsx`: `useLocalRuntime(coachChatAdapter, { adapters: { history: coachHistoryAdapter } })` inside `AssistantRuntimeProvider`, rendering `Thread` from `src/components/assistant-ui/thread.aui.tsx`. History reloads on foreground by remounting the provider (the local runtime loads history once and has no refetch).
- `src/app/_layout.tsx`: Stack without headers, `registerForPush()` on mount, notification-response observer.
- `src/coach-adapter.ts`: streaming adapter (POST /messages via `expo/fetch`, raw text chunks; a non-2xx becomes an inline "Coach unavailable: …" text) and the history adapter (GET /messages). Server messages map to assistant-ui messages with `metadata.custom = { kind?, block?, session? }`.
- `src/push.ts`: handler at module top, permission, Expo push token, POST /device.
- `src/components/assistant-ui/`: the scaffold's `thread.aui.tsx`, `message.tsx`, `composer.tsx`, `theme.ts`, plus `coach-metadata.tsx` (a first rendering of plan cards and verdict captions from `metadata.custom`). All of this is the surface to redesign.

## Data the surface receives

- A **plan** message: `role: 'assistant'`, `kind: 'plan'`, text = the coach's prose, `block = { name, weeks, sessions: [{ name, focus, hevyRoutineId, exercises: [{ title, sets, reps, weightKg, rpe, note }] }] }` — the session cards come from `block.sessions`.
- A **verdict** message: `kind: 'verdict'`, `session = "<session name>"`, `createdAt` — the grey caption is session name and time.
- The tool progress line streams inside the coach's reply as `"\n\nReading your history and writing your block"` followed by one `.` every 15 s, then `"\n\n"` and the plan prose. It is not persisted; the reloaded history shows only the prose.
- Empty thread: no messages at all (the coach never speaks first).

## Known gaps for the surface pass

- The list is not scrolled to the newest message on load (the scaffold's `MessagesFlatList` cannot simply be inverted: its `data` is oldest-first and the render prop reads `state.thread.messages[index]`).
- The progress line renders in the reply colour; the brief wants grey.
- Plan cards default to the one-line exercise summary; the full list is an open decision in the brief.
- Push permission prompt appears on first launch (by design); on the simulator it can be allowed by hand.

## Do not change

Dependency list (see `docs/spec.md`; `assistant-cloud` is there for a reason), the adapter's request shapes, `EXPO_PUBLIC_*` env names, anything under `server/`.

## Update 2026-09-10 17:15: four tabs and onboarding are in place

Since the note above, the owner decided on four tabs and a native onboarding (spec amendment at the end of `docs/spec.md`). All of it is committed, unstyled beyond `theme.ts`, and runs on the simulator against the live server. The surface pass now covers:

- `src/app/(tabs)/_layout.tsx`: labels-only tab bar (Coach, Plan, Progress, Profile), tint from the theme.
- `src/app/(tabs)/coach.tsx`: the thread (unchanged data path).
- `src/app/(tabs)/plan.tsx` + `src/components/plan/*`: block title and caption, the next session pinned with its full exercise list, other sessions collapsed to Hevy's one-line summary, completions with the verdict's first line, empty state.
- `src/app/(tabs)/progress.tsx` + `src/components/progress/*`: stats row, one card per lift with best set and e1RM trend (three numbers and an arrow glyph).
- `src/app/(tabs)/profile.tsx` + `src/components/profile/profile-rows.tsx`: one card per intake step, rows label/value/chevron, rebuild action.
- `src/app/onboarding/index.tsx` + `src/components/onboarding/*`: six steps, pills for single and multi select, numeric inputs, notes field, review step, the streamed build card.
- Shared: `src/components/screen.tsx` (Screen, ScreenTitle at 34/700, SectionLabel, InlineError), `src/lib/options.ts` (all human labels), `src/lib/server.ts` (`useServer`).

Known gaps for the pass: the pinned Next card can show a past verdict for that session; InlineError double-pads inside gutter-padded screens; "Start setup" from the empty Plan restarts all steps; the tab bar has no glyphs (no icon package is installed; SF Symbols would need `expo-symbols`, which is not in the dependency list).
