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
