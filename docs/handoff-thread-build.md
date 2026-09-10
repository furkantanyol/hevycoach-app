# Hand-off for the surface pass (impeccable), rewritten 2026-09-10 18:05

The app is one screen: the client chat with an AI coach, the way Hevy Coach's client side is a chat with a human coach. Logging and routines stay in Hevy. Contract: the "Amendment 2026-09-10 18:00" section of `docs/spec.md`. Direction: `.impeccable/surfaces/src-app-index-tsx.md` (alongside Hevy, light, system font, one accent).

## What the screen contains (`src/app/index.tsx`)

- Large title "Coach" with a grey strip under it from `GET /week`: "This week 2 workouts · next Day 2 Heavy Upper".
- The thread (`@assistant-ui/react-native`, `src/components/assistant-ui/*`): coach left in a light-grey bubble, user right in Hevy blue.
- Pills under the last coach message when it carries choices (intake questions; the review's "Apply changes" / "Keep as is"). Single-select sends on tap; multi-select toggles and sends with a "Done" pill. Typing is always allowed.
- A review message shows a small grey caption "Review · time" above its bubble. A plan message ends with the line naming the routines to open in Hevy.
- Composer pinned above the keyboard; blue circular send.

## Data shapes the surface receives

`Message = { id, role, text, createdAt, kind?: 'plan' | 'review', choices?: { label, value }[], multi?: boolean }` mapped into assistant-ui messages with `metadata.custom = { kind, choices, multi }`. `POST /messages { text, choice? }` streams raw text.

## Known gaps for the pass

- Pills are unstyled beyond the theme tokens; the empty-thread moment before the opener loads is blank.
- The strip's loading state is an empty line.
- No icons anywhere (no icon package in the dependency list).

## Do not change

Dependency list, request shapes, `EXPO_PUBLIC_*` names, anything under `server/`.
