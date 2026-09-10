---
version: 1
slug: "src-app-index-tsx"
primary_target: "src/app/index.tsx"
related_targets: []
---

# Thread (src/app/index.tsx)

Mode: Operate. Confirmed by the owner 2026-09-10 after a direction round (seed 446dab8f, re-rolled once, resolved by the owner's steer to the standing convention: alongside Hevy, simple).

## Audience and job
The owner, reading a verdict seconds after a workout and answering its one question; asking training questions between sessions; intake on first contact. One-time second audience: an interviewer on a live screen share, 2026-09-11.

## Task and content
Read the coach's message, reply. Content is the coach's two-to-five-line prose; a plan's block (sessions, exercises, sets, reps, kg, RPE); a verdict's session name and time. Nothing else on screen.

## Direction: alongside Hevy, light leads
Visual authority: the owner's Hevy screenshots (docs/IMG_2406-2410.PNG, gitignored). Sampled: ground #FFFFFF, text #010A26, secondary #959A9F, pills and stripes #F4F5F8, hairline #E9EAEC, accent #4A9EF8 (the only accent). System font at Hevy's weights: large title, regular body, grey small-cap labels. Chat part follows iOS Messages: coach left in a light-grey bubble, user right in Hevy blue, no avatars.
Memorable moment: a plan lands and the block's sessions appear as Hevy's routine cards (title "1 Upper A", grey one-line exercise summary, hairline border, rounded corners) under the coach's text, showing what was written into Hevy.
Verdict: grey caption above the bubble with session name and time. Tool progress line streams as grey text inside the coach bubble.

## Scope and anti-goals
One screen from the assistant-ui styled scaffold. No tab bar, charts, stats, custom fonts, dark-first, or invented capabilities (no "open in Hevy").

## States and ranges
Empty thread: one grey line inviting the first message, no fabricated coach opener. Streaming reply. Progress line. Plan with 2-6 session cards. Verdict. Inline error line (no network, rejected token). Push permission on first launch. History reload on foreground. Messages 1-600 chars; threads 0-hundreds.

## Interaction and layout
Large title like Hevy's "Workout"; inverted list scrolled to newest; composer pinned above the keyboard in the safe area; blue circular send; 44 pt targets; Dynamic Type via system text styles. Dark mode via semantic colours, derived (no Hevy dark reference).

## Open decisions
Exact dark-appearance mapping. Plan cards: one-line summary (default) vs full exercise list.
