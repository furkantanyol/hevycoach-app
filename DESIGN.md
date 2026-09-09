# The Block Chart

The form this app is drawn in, its tokens, its primitives, its motion, and the
finish review that closes the build.

- **Form:** The Block Chart, seed key `c2b20aa3`.
- **Thesis:** the programme is the interface — weeks as columns, load as banded
  rows. It refuses the fitness dashboard of rings, cards and streaks.
- **Contract:** the header comment of [`src/app/_layout.tsx`](src/app/_layout.tsx).
  Where this document and that comment disagree, that comment wins.

---

## 1. The world

A printed programme sheet. Paper-white ground, hairline rules, near-black ink,
tabular figures, system faces and no brand face. Load is a five-step greyscale
ramp, because greyscale survives gym glare and a photocopier. There is exactly
one chromatic colour and it is a highlighter struck across today.

Everything else follows from that: no cards, no shadows, no rounded containers,
no tint colour, no accent on a back button, no chart library. A row is a row on
a sheet; the line between two rows is a rule; the only "container" in the app is
the ruling itself.

## 2. Tokens — `src/constants/theme.ts`

Colours are named for their role on the sheet, not for their value.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `ground` | `#FFFFFF` | `#0C0C0C` | The paper |
| `rule` | `#C9C9C9` | `#3A3A3A` | The ruling |
| `ink` | `#111111` | `#F2F2F2` | What is written on it |
| `inkSecondary` | `#6E6E6E` | `#9C9C9C` | A note, a stamp, a date |
| `inkOnMarker` | `#111111` | `#111111` | Ink lying over the highlighter |
| `marker` | `#E8FF3B` | `#E8FF3B` | Today, and nothing else |
| `load1`…`load5` | `#D4D4D4` → `#3A3A3A` | `#2E2E2E` → `#BEBEBE` | The load ramp |

**The ramp inverts honestly.** A heavier session is always more ink than a
lighter one; on dark paper more ink means brighter. Both ramps are spaced to the
same contrast against their own ground — step 1 lands at ~1.45:1, step 3 at
~3.45:1, step 5 at ~10.5–11.4:1 — so a band means the same thing in either
appearance. The low end deliberately starts clear of the ground: a day with
nothing planned draws **no band at all**, so the lightest band is the one thing
it must never be mistaken for.

**The marker is drawn with ink edges, always.** `#E8FF3B` is 17.5:1 on the dark
ground and only 1.12:1 on paper white — as a bare fill it is invisible in light
mode, which would leave today unmarked. The edges (`MARKER_EDGE_WIDTH`, drawn in
`inkOnMarker`) carry the boundary at ~18.9:1 in both appearances. The fill is
the character; the edge is what makes it findable.

**Type is the system's.** `ThemedText` names the Dynamic Type ramp each variant
belongs to (`body`, `subheadline`, `title1`) rather than scaling everything by
one multiplier, because iOS's curves diverge at the accessibility sizes. Three
variants exist — `default`, `small`, `subtitle` — and `subtitle` is 22/28 in one
place, so no screen carries its own title size.

**Figures are tabular everywhere.** `Figures.tabular` is applied to every number
on screen. A misaligned column is a defect: a block chart's whole premise is
that columns of numbers line up.

**Spacing** is a fixed scale — 2, 4, 8, 16, 24, 32, 64 — and `Screen` holds the
only two page shapes (a list, and a scrolled column of stamped sections).

## 3. Primitives

| Primitive | File | What it is |
| --- | --- | --- |
| `Rule` | `components/motion.tsx` | One ruled line, hairline or ink-weight |
| `Stamp` / `StampedField` / `StampedHead` | `components/stamp.tsx` | The small tracked caps a sheet heads its columns with, and the only header this world has |
| `RuledRow` / `RuledHeader` | `components/ruled-row.tsx` | One line of a ruled table: label left, figures in fixed columns right, hairline under |
| `RuledButton` | `components/ruled-button.tsx` | An action drawn as a box ruled on the sheet; filled with ink, never the marker |
| `WeekStrip` | `components/week-strip.tsx` | The week as columns — the chart, and the app's only navigation between days |
| `OneRepMaxChart` | `features/lifts/e1rm-chart.tsx` | The one chart: a polyline out of plain views, no drawing library |
| `ThemedView` / `ThemedText` | `components/` | The paper, and the ink on it |

**A figure shrinks rather than spilling.** Table columns are a fixed width and
Dynamic Type is not, so every figure and every week-column head carries
`numberOfLines={1}` + `adjustsFontSizeToFit` + `minimumFontScale={0.7}`. The
week strip's own height is a `minHeight`, so at the accessibility sizes the
strip grows instead of clipping what it cannot shrink.

**Nothing derives a number.** `RuledRow` prints what it was given. Every figure
in the app is Hevy's own — a routine's stored target, or a set the lifter
logged. The rules engine that would compute a target does not exist yet, and a
made-up one would be worse than none. The same rule reaches outside the app: the
Apple Health export writes an energy estimate only when Hevy holds a real
bodyweight, and writes none otherwise (see [ADR 0003](docs/adr/0003-estimated-energy.md)).

## 4. The two marks on the week strip

They mean different things and are never confused:

- **The marker** — fluorescent, full height, ink-edged — is struck across the
  real calendar today (`WeekDay.isToday`) and stays there. It cannot be dragged.
  A highlighter cannot be un-struck.
- **The reading** — a 3pt ink rule under one column — travels with the finger
  and says which day the table below is showing. Drag it to last Tuesday and
  today is still highlighted.

The gesture is one thing: the reading follows the finger frame by frame on the
UI thread, and the table re-rules under the finger rather than on release, so
the chart and the detail are one gesture rather than a header above a list. The
band's darkness and its height encode the same real thing — that session's own
stored set count, ranked against the rest of the week. No band is labelled,
because a label would make a display scale look like a prescription.

## 5. Motion grammar — `components/motion.tsx`

The whole grammar, in one file: **things are ruled into place, never faded in.**

- `Rule` extends from the left edge to the right over 220ms, the way a line is
  ruled by hand.
- `Settle` drops content the last 6pt onto that rule over 180ms, delayed until
  the rule has finished extending. Nothing renders while hidden, so a screen
  waiting on Hevy has no reserved gap.
- The marker's reading travels 180ms to the column it was released over.
- A load band cross-fades its colour over the same 180ms when the week re-ranks.

**Reduce Motion** is honoured by zeroing durations, not by skipping the change,
so nothing ever appears late. A stack push is turned off rather than shortened.

## 6. The screens

| Screen | Composition |
| --- | --- |
| **Today** `(tabs)/(today)` | `StampedHead` (BLOCK / WEEK) → the `WeekStrip` → the selected session's title, settling in → the session as a ruled table, whose lead row is set large when the day being read is today. The first target is the largest thing on screen. |
| **Program** `(tabs)/program` | Each saved routine as a session heading over a ruled table of its exercises; a row opens the lift behind it. |
| **Review** `(tabs)/review` | The week by muscle group as ruled rows, then the most recent session as its own stamped table. |
| **Lift detail** `features/lifts` | A lift's history, the one chart, and its notes. |
| **Settings** `(tabs)/settings` | Stamped sections, ruled answers, ink actions. |
| **Onboarding / Pro** | Whole-app states outside the tab bar, drawn on the same sheet. |

Navigation chrome is part of the sheet, not a frame around it: headers and the
tab bar sit on the same ground, separated by the same hairline. The marker is
not offered as a navigation tint — that would spend it on every back button.

## 7. The shipping rasters

Every raster this app ships is drawn by
[`scripts/draw-rasters.mjs`](scripts/draw-rasters.mjs) from the palette above,
and the mark is the chart itself: five ruled columns rising left to right, the
last one struck through with the marker, standing on an ink baseline.

```sh
node scripts/draw-rasters.mjs
```

It writes `icon.png`, `splash-icon.png` (+ a dark-appearance variant),
`favicon.png` and the three Android adaptive-icon layers — the monochrome layer
renders the ramp as alpha, which is what Android tints. Each file carries `tEXt`
provenance chunks: title, the script that drew it, the form and seed key
(`The Block Chart, seed key c2b20aa3`), the commit it was drawn at, and the
date. `strings assets/images/icon.png | head` reads them back.

No stock template artwork remains in the repo.

---

## Finish review

Reviewed against the contract in `src/app/_layout.tsx`, on the build at this
commit. What the review found, and what was done about it:

| Contract line | Finding | Resolution |
| --- | --- | --- |
| "One fluorescent marker highlight, reserved for today and used nowhere else" | The marker was wired to `selectedKey`, so dragging it put the highlight on a day that was not today and left the real today unmarked. | The marker is pinned to `day.isToday`; selection got its own quieter mark, a 3pt ink rule that travels. The build was raised to the contract, not the contract lowered. |
| "survives gym glare and greyscale reproduction" | `load1` sat 1.17:1 from the ground, indistinguishable from a day with no session at all. | Both ramps respaced; step 1 now lands ~1.45:1 against its own ground, and the two appearances mirror each other step for step. |
| "One fluorescent marker highlight" (legibility) | `#E8FF3B` is 1.12:1 on paper white — in light mode the app's single anchor was effectively unmarked, well under WCAG 1.4.11's 3:1 floor. | The marker is always drawn with ink edges (~18.9:1). One hex kept for both appearances. |
| "System faces… so Dynamic Type keeps working" | The week strip's day heads were fixed-size text in a fixed-height row: at the larger text sizes they overflowed into the band above and the table below. | The strip's height became a `minHeight`, and the heads shrink-to-fit the same way `RuledRow`'s figures already did. |
| "every figure on it is Hevy's own" | A hardcoded 80 kg bodyweight was silently substituted and the resulting energy written into Apple Health as fact, with no per-export disclosure. | The fallback is deleted. No bodyweight, no energy sample. ADR 0003 amended; settings copy says what turns the estimate on. |
| Dead weight | `ThemedText`'s `title` and `linkPrimary`, `Stamp`'s `onMarker`, `LiftLink`'s `lead`, `ThemedView`'s `type`, and the same 22/28 title override copy-pasted across four screens. | All deleted; the title size lives once, in `ThemedText`. |
| "every shipping raster carrying its provenance" | Every raster was stock Expo template art — the splash was byte-identical to `expo-logo.png`, the iOS icon source was Expo's own symbol — and none carried provenance. | All shipping rasters redrawn from the palette as the Block Chart mark, each stamped with seed key, commit and date; the unused template art deleted. |
| "unreviewed and undocumented is unfinished" | No DESIGN.md, no review, no verdict. | This document. |

### What was deliberately left alone

- **The reading is an ink rule, not an outlined column.** An outline would be a
  second box on a sheet that has no boxes. A heavier ruling under a column is
  what a printed sheet already does.
- **`inkOnMarker` stays near-black in both appearances.** A highlighter lies
  behind text; the text does not change colour because the paper did.
- **The load ramp is still a display scale ranked within the week**, not an
  absolute one. It says which of the lifter's own sessions is the bigger one and
  refuses to say how hard a session should be.
- **`Stamp` was not consolidated into the week strip's column heads.** Their
  sizes, weights and tracking genuinely differ; forcing one component over both
  would cost more than the duplication saves.

## Verdict

**Ship.**

The five blocking findings are closed in the build rather than in the contract:
today is highlighted and stays highlighted, the marker is legible on paper white
as well as on black, the ramp clears its ground in both appearances, the week
strip survives the accessibility text sizes, and no invented number reaches
Apple Health. The form is documented here, the rasters are the app's own mark
and carry their provenance, and `pnpm validate` and `npx expo export --platform
ios` both pass.

Two things are known and open, and neither blocks:

1. **The lead row's size is not verified on a small device at the largest
   accessibility sizes.** `RuledRow`'s lead figure is 34pt before scaling; it
   shrinks to fit its column, but the pairing has only been reasoned about, not
   seen on hardware.
2. **The rules engine still does not exist**, so Today shows Hevy's own stored
   targets and nothing more. That is the honest state of the app, not a gap in
   the design — but the Block Chart is drawn to hold a computed target, and the
   day it does is the day the first-viewport promise ("the first target is the
   largest thing on screen") gets its real subject.
