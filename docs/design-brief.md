# Design brief for the app surfaces (2026-09-10 17:45)

Direction is the one the owner confirmed through impeccable (`.impeccable/surfaces/src-app-index-tsx.md`): alongside Hevy, light leads, very simple, native controls, no invented chrome. Tokens live in `src/components/assistant-ui/theme.ts`: ground #FFFFFF, text #010A26, secondary #959A9F, fills #F4F5F8, hairline #E9EAEC, accent #4A9EF8 (the only colour). System font; iOS text styles (large title 34/700, title 22/600, body 17/400, caption 13/400 in secondary). Dark mode derived from the same semantic tokens.

UX rules applied from ui-ux-pro-max (the engine's automatic palette and font picks were rejected as off-brand):
- 44pt targets, 8pt spacing rhythm, 16pt gutters, safe areas respected, primary action pinned above the home indicator.
- One primary action per screen (accent, full width, 52pt, 26pt radius); secondary actions are text.
- Press feedback within 100 ms (opacity 0.7), no layout shift on press; disabled = 40% opacity.
- Labels on every field, helper text in secondary grey, errors as text near the field, never colour alone.
- Progress for multi-step flows, Back always available, nothing forced.
- Keyboard avoided; numeric keyboards for numbers; Dynamic Type through system text styles.

## Onboarding (welcome + four steps)

- **Welcome**: the app icon (96pt, 22pt radius) centred in the upper third, "HevyCoach" as large title, one line "Your coach on top of Hevy." and two short captions ("Reads your whole history." / "Writes your plan into Hevy and judges every workout."), "Let's start" pinned at the bottom.
- **Step chrome**: thin progress bar under the status bar, "Step N of 4" caption, large title, one-line subtitle in secondary saying why the step matters, content, then Back (text) and Continue (primary) in the safe area.
- **1 About you**: Sex as three equal pills in a row; Age as a large numeric input (28pt, tabular figures) with the unit label "years" beside it.
- **2 Goals and schedule**: Goals as a two-column grid of selectable cards (title, checkmark when selected, multi-select, at least one); Days per week as seven circular pills (1–7) with the prefilled one selected; Bodyweight as a prefilled chip "82 kg · from Hevy" that turns into an input on tap.
- **3 Anything to work around?**: injuries as a list of rows with a trailing checkmark (multi-select, "Nothing" clears), then an optional notes field with the helper "Anything the coach should know: pain, equipment limits, preferences."
- **4 Review and build**: answers grouped in one card with a subtle "Edit" per group, then "Build my block". During the build: the icon, the streamed progress line with dots, then the plan text in a card and "Open the plan".
- Prefilled silently and editable later in Profile: session length, years training, equipment. Defaults: training style hybrid, cardio none.

## Tabs

- **Plan**: large title = block name, caption weeks and start; the next session as a raised card (white on the fill background, 16pt radius) with a small accent "Next" label; other sessions as flat cards with hairline borders; exercises as rows "Bench Press (Barbell) · 4 × 5 · 85 kg · RPE 8" with tabular figures.
- **Progress**: three stat tiles in a row (workouts, this week, since year); lift rows with the title, best set, and the trend as "105 → 105 → 105" with an arrow glyph tinted only when up.
- **Profile**: grouped rows (label left, value right, chevron), one group per step plus "Details" (session length, years training, equipment, training style, cardio); tapping a row opens a picker screen with the same pills; "Rebuild block" as the primary action at the bottom.
- **Tab bar**: labels only for now (no icon package installed); active label in accent.

## Additions from the 17:47 simulator pass

- Progress: a lift with no logged weight (bodyweight work, e1RM trend all zeros) shows its rep record as the best ("40 reps") and a dash instead of the trend; never "0 · 0 · 0".
- Tab bar: no placeholder glyphs (the "▼" triangles go); labels only until an icon set is chosen.
- Trend arrows: "→" for flat, "↑" tinted accent only when the last value is above the first, "↓" in secondary.
