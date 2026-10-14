---
name: SQLShield Demo
description: A continuous-form fanfold printout that shows exactly where input stops being data.
colors:
  paper: "#ece5d8"
  sheet: "#f7f3ea"
  sheet-raised: "#fffdf8"
  ink: "#17181c"
  ink-soft: "#45494f"
  ink-faint: "#5c626a"
  rule: "#cdc4b1"
  rule-soft: "#ddd5c5"
  carbon: "#463a66"
  carbon-mid: "#6b5c8e"
  carbon-wash: "#e5e0ee"
  alarm: "#9d2f1d"
  alarm-wash: "#f6e6e1"
  guide: "#626d7a"
  selection: "#d6cdea"
  rail-void: "#b9b0a0"
typography:
  display:
    fontFamily: "Azeret Mono"
    fontSize: "clamp(28px, 5.4vw, 60px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Azeret Mono"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.02em"
  body:
    fontFamily: "Azeret Mono"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Azeret Mono"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.14em"
  data:
    fontFamily: "Azeret Mono"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.65
  measured:
    fontFamily: "Azeret Mono"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  none: "0"
  mark: "1px"
spacing:
  xs: "4px"
  sm: "9px"
  md: "14px"
  lg: "20px"
  xl: "26px"
  band: "clamp(20px, 3.4vw, 40px)"
  gutter: "clamp(16px, 4vw, 56px)"
components:
  record-original:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "20px 18px 24px"
  record-carbon:
    backgroundColor: "{colors.carbon-wash}"
    textColor: "{colors.carbon}"
    rounded: "{rounded.none}"
    padding: "20px 18px 24px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.none}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.sheet}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "11px 18px"
  button-unsafe:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.carbon}"
    rounded: "{rounded.none}"
    padding: "11px 18px"
  input-text:
    backgroundColor: "{colors.sheet-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
---

# Design System: SQLShield Demo

## Overview

**Creative North Star: "The Continuous-Form Printout"**

The system is a fanfold printer roll. Warm bond paper, tractor-feed perforations
running down both edges, sheets torn off at the form feed, and one strict
monospace column grid carrying every mark on the page. The world was chosen over
its two neighbours on purpose: it is neither the dark hacker terminal that every
security demo defaults to, nor the clean blue dashboard that every product page
defaults to. It is a working instrument, and it is warm.

The organizing idea is that **a printer has a fixed field width, and overflow is
a physical event**. Every statement on this page is printed at a real 11px
monospace whose advance is `0.65em`, giving a column of `7.15px` and a field
width of exactly 72 columns. A character beyond column 72 is not styled to look
wrong; it is *positioned* past where the printer could have put it, and marked.
The measurement is computed from the server's actual response string, so the
column count is true rather than illustrative.

Density is high and the rhythm is even, the way a real printout is dense and
even. Warmth comes from the paper, not from softness: no rounded corners, no
shadows that suggest floating glass, no gradients implying depth the material
would not have. Restraint is the craft signal — this is a portfolio artifact
about precision, and precision reads as competence while effects read as noise.

**Key Characteristics:**

- One monospace grid, and nothing floats off it.
- Zero corner radius, everywhere. Paper has cut edges.
- Exactly one hue carries meaning: carbon-copy violet for a flow that should not
  exist, oxide red for a statement the parser refused.
- A statement that overruns its field is a *measurement*, not an illustration.
- Motion is one authored moment: the carriage advancing. Nothing else moves on
  its own.

## Colors

A two-material palette: warm paper and black ink, plus one carbon-copy violet
that commits a whole region, and one oxide red reserved for parser refusal.

### Primary
- **Carbon-Copy Violet** (#463a66): the color of a duplicate form. It owns the
  entire unsafe record — background wash, type, chip, and stamp — so that a
  scan of the page finds the dangerous flow before it finds anything else.

### Secondary
- **Oxide Red** (#9d2f1d): a statement the parser refused. Reserved strictly for
  `data-outcome="rejected"` and for characters that have escaped the field
  width. Never decorative, never used for hover.

### Neutral
- **Bond Paper** (#ece5d8): the roll behind the sheets, warm and slightly aged.
- **Sheet White** (#f7f3ea): a fresh sheet, very slightly off-white so it lifts
  off the roll without a shadow doing all the work.
- **Input White** (#fffdf8): fields read as an unmarked region being written on.
- **Press Black** (#17181c): the original ink. All body type, the primary button,
  the lit status lamp.
- **Soft Ink** (#45494f) and **Faint Ink** (#5c626a): prose and margin notes.
  Both clear 4.5:1 on sheet white; faint ink is the floor, not a hint.
- **Rule** (#cdc4b1) and **Soft Rule** (#ddd5c5): band separators and sheet
  borders. Dashed means "these are two sheets"; solid means "same sheet".
- **Column Guide** (#626d7a): the ruler numerals. Faint in role, but they are
  read, not decoration, so they clear the legibility floor.

### Named Rules

**The One Hue Rule.** Carbon-copy violet is the only color that owns a region.
It marks exactly one thing: a flow that produced a copy of data it should never
have reached. Oxide red appears only on a statement that failed or on characters
that overran the field. Neither is ever used for emphasis, hover, or decoration.

**The Original-Is-Neutral Rule.** The safe record is uncolored paper. It is the
default, the baseline, the thing that happens when the system behaves. Only a
deviation earns ink.

## Typography

**Display Font:** Azeret Mono (self-hosted variable, weights 100–900)
**Body Font:** Azeret Mono (self-hosted variable)
**Label/Mono Font:** Azeret Mono — the same face, because a line printer has one
font and the world's honesty depends on not faking a second one.

**Character:** An industrial grotesque monospace with real weight range and a
slightly squared, machine-shop personality. It reads as machine output because
it is carrying machine output, not because monospace is shorthand for technical.
The variable axis supplies the scale steps a single-weight typewriter face cannot.

### Hierarchy
- **Display** (800, `clamp(28px, 5.4vw, 60px)`, 1.02, -0.03em): the claim, once,
  at the top of the roll. A `<em>` inside it drops to weight 300 for the
  contrasting phrase.
- **Headline** (700, 18px, 1.25, 0.02em): the record's own title — the unit being
  compared. It is the loudest thing inside a record.
- **Body** (400, 14px, 1.6): thesis, prose, and the mitigation list. Measure
  capped at 68ch.
- **Data** (400, 12.5px, 1.65): response payloads, driver calls, bound values.
  The real evidence, given room to be read.
- **Measured** (400, 11px, 1.65): printed statements only. Smaller *because* the
  field-width calculation requires it, and exempted from the body floor as a code
  context. It is the one place a size is derived from a measurement rather than
  chosen for comfort.
- **Label** (600, 11px, 0.14em, uppercase): field names, chips, form labels, and
  running heads. Carries its quietness through tracking and ink, not through size.

### Named Rules

**The Margin Is Not Smaller Than The Title.** A running head is marginalia: it
must be a `<p>`, not a heading, and it must be visually subordinate to the record
it introduces. A section heading smaller than the thing it labels is a hierarchy
inversion, and it is the single most common way a print-style layout goes wrong.

**The One Grid Rule.** Every printed mark — ruler tick, field-limit rule, and
character — derives its column width from the same `0.65em` at the same font
size. Never derive a column width from `ch` in a differently-sized context; the
unit silently resolves against that context's font and the ruler ends up
measuring a line of text that is not there.

## Layout

The roll is a three-column grid: `26px | 1fr | 26px`, the outer columns being
perforated tractor rails that persist at every viewport. Sheet content is capped
at `1240px` and centred, with a gutter of `clamp(16px, 4vw, 56px)`.

Bands are separated by a `1px dashed` rule and padded `clamp(20px, 3.4vw, 40px)`
block. Spacing is one rhythm throughout: 4 / 9 / 14 / 20 / 26, with more space
above a heading than below it.

Two breakpoints carry real decisions:

- **≥1300px** — records sit side by side. This is not a preference: a measured
  statement is 72 columns ≈ 515px wide, and two of them plus their sheet padding
  is what 1300px buys. Below it, records stack rather than shrinking into columns
  too narrow to hold the measurement.
- **≤720px** — the hanging field label moves above its value, the rubber stamp
  leaves its corner and joins the flow, and **the ruler and the column limit are
  removed entirely**. A 72-column ruler on a 390px screen would be a lie about a
  measurement that cannot be made there. The per-character overflow marking
  survives, so the mechanism is still legible.

## Elevation & Depth

Depth is tonal, not cast. A sheet is separated from the roll by being lighter
(`#f7f3ea` on `#ece5d8`) and by a 1px border; a low, tight shadow
(`0 6px 14px -10px`) only suggests the sheet is lying on the roll. There is no
glass, no blur, no glow, and no z-axis beyond two levels: roll and sheet.

### Shadow Vocabulary
- **Sheet lift** (`0 1px 0 rgb(23 24 28 / 0.05), 0 6px 14px -10px rgb(23 24 28 / 0.42)`):
  records and slips only. A sheet resting on paper.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadow exists to say
"sheet on roll", never to decorate. A wide blur on a thin border is a drop shadow
wearing a paper costume, and it is the fastest way to make a printed world look
assembled rather than made.

## Shapes

Zero corner radius is the base rule — paper has cut edges, not rounded ones. The
only radii in the system are `1px` on the overflow character highlight and `6px`
on the scrollbar thumb. The perforated rails are built from tiled radial
gradients at `12px × 20px`; the torn top edge of a carbon copy is a two-gradient
`mask-composite: intersect` that notches the paper, not a border on a card.

The signature silhouette is the **tear**: a fresh sheet from the printer has a
clean top edge, and a carbon copy has a notched one. That difference is geometry
before it is color.

## Components

### Buttons
- **Shape:** square corners, `1px solid` ink border, `11px 18px` padding, 600 weight.
- **Primary:** ink fill, sheet-white text.
- **Secondary:** sheet fill, ink text; inverts to ink-on-sheet on hover.
- **Unsafe:** carbon-violet border and text; fills violet on hover.
- **Hover / Focus:** 130ms ease on background and color, `translateY(1px)` on
  active. Focus is a `2px` carbon outline at `2px` offset — visible on paper.
- **Disabled:** `opacity: 0.42`, `cursor: default`, paired with `aria-busy` while
  a request is in flight.

### Records (signature component)
A record is one API response printed on one detached sheet.
- **Original** (`data-flow="safe"`): sheet white, ink type, clean top edge, stamp
  reads `SAFE`.
- **Carbon** (`data-flow="unsafe"`): violet wash, violet type, notched top edge,
  stamp reads `INJECTED` at `-3.5deg`.
- **Rejected** (`data-outcome="rejected"`): oxide red on a red wash, stamp reads
  `INVALID`.
- Internals are printed fields: a name in a 74px hanging margin (query/bound/call/
  response), except the measured statement, which takes the full sheet width so
  72 columns fit.
- The stamp is a rotated rubber stamp with a `2px` border at `0.62` opacity — one
  per sheet, never a badge row.

### The measured field
A `.measured` block owns the measurement contract:
- `--col: 0.65em` and `--cols: 72` at `font-size: 11px`, so one column is
  `7.15px` and the field is `514.8px`.
- `.ruler` ticks are `calc(10 * var(--col))` wide flex items; `.limit` is a rule
  at `calc(72 * var(--col))`. Both must resolve inside the same font context as
  the text they measure.
- `.typed` marks where the user's own input landed; `.ov` marks every character
  at or past column 72. Where a character is both, `.ov` wins — the escape is the
  more urgent fact.
- Hidden below 720px rather than scaled.

### Inputs / Fields
- **Style:** 1px rule border with a `2px` ink-3 bottom edge — an underline you
  write on. Square, `#fffdf8` fill, carbon caret.
- **Focus:** `2px` carbon outline at `2px` offset.
- **Select:** native appearance, with a drawn CSS chevron so the control does not
  ship a browser-default arrow.

### Status lamp
A printer lamp, not a badge: an 8px dot that is faint ink while checking, ink
filled with a soft ring when up, and hollow when the backend is unreachable.
Text always names the state in words.

## Do's and Don'ts

### Do:
- **Do** compute the overflow from the server's real response string, and mark
  characters by index against a derived column width.
- **Do** show the server's own `note` and error text verbatim, including a 500's
  SQLite complaint — it is the most informative thing on the page.
- **Do** distinguish a request that was *refused* from a statement the
  *database* rejected from a flow that *succeeded*, in words as well as color.
- **Do** let the mark (`.typed` / `.ov`) win over the color, since the label is
  what carries the meaning for a colorblind reader.
- **Do** keep functional text at 11px or larger; only the measured statement is
  exempt, and only because it is code whose width is load-bearing.

### Don't:
- **Don't** abstract the response into a chart, a diagram, or a friendly summary.
  Raw JSON is the evidence; a reviewer is judging honesty first.
- **Don't** style a bypass as danger — no skulls, no alarms, no red flood. The
  violet carbon copy and the literal row count make the point.
- **Don't** soften the unsafe path: never rename a returning payload "success",
  never hide rows that came back.
- **Don't** show a ruler or a column limit at a width where the measurement
  cannot actually be made.
- **Don't** add a second accent hue, a rounded card, or a drop shadow that is not
  a sheet sitting on a roll.
- **Don't** use monospace as a costume for "technical". Here it is the printer's
  only font, and it is carrying real statements, values, and driver calls.
