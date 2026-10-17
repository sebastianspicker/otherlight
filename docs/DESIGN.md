# Design system

## Direction: Deep Field

The Browser is a dark observatory. Near-black space carries a small number of
raised, hairline-ruled panels; text is starlight; a single ice-blue accent means
"your change". Astronomy's two kinds of visual evidence keep their places: the
sky view is **Plate 1**, the deepest surface, with registration marks and an
envelope line, and the light curve is **Figure 2**, a framed figure with inward
ticks and a numbered label. An evidence line under the masthead always states
which kind of evidence is on screen, and a field guide below the experiment
teaches the relations behind every figure.

The look is minimal on purpose: no starfields, glass cards or decorative
imagery, and no glow beyond a soft focus ring and the trace-B key sample. Depth comes from three surface steps, hairlines and one
faint, static sky glow behind the page and the plate.

## Foundations

Tokens live in `apps/browser/src/presentation/styles/deep-field/tokens.css`.
Canvas figures mirror the same roles in
`apps/browser/src/presentation/render/canvas/figureInk.ts`; change both
together.

| Role        | Value     | Use                                                     |
| ----------- | --------- | ------------------------------------------------------- |
| Space       | `#07090d` | Page ground, under a faint zenith glow                  |
| Surface     | `#0d1017` | Panels and the figure canvas ground                     |
| Surface 2/3 | `#131824` | Default buttons, active segments, tooltips (`#1a2030`)  |
| Plate       | `#03050a` | The sky canvas, the deepest surface                     |
| Ink         | `#e9ecf2` | Text, trace A (dashed), the Start button                |
| Ink 2 / 3   | `#b4bccb` | Supporting copy / labels and units (`#8e97aa`, ≥ 6:1)   |
| Rules       | 10–30 % α | Hairlines between regions; fields use `#5b6580` (≥ 3:1) |
| Accent      | `#8ab4ff` | "Your change": trace B, current phase, focus, primary   |
| Starlight   | `#f4cf8a` | Brand mark and the Scientific / model-boundary marker   |
| Caution     | `#e8c26e` | Model notes and replay boundary, on a faint wash        |
| Fault       | `#ff8f86` | Invalid input and failures, on a faint wash             |
| Pass        | `#7fd6a4` | Passed lesson checks, the status dot                    |

The interface is dark only (`color-scheme: dark`). Ink is above 13:1 on every
surface, ink 2 above 8:1, and ink 3 above 5.5:1.

### Type

- **Atkinson Hyperlegible Next** sets the interface and headings: labels,
  controls, lesson prose, help. It was designed for legibility at small sizes.
- **STIX Two Text** sets the display titles, equations and variables, where its
  mathematical italic matters.
- **Atkinson Hyperlegible Mono** sets readouts, tick labels and serialized
  evidence, and the small tracked capitals used as instrument labels
  (section kickers, figure numbers, readout labels). Use these labels sparingly.

All three are OFL-licensed, subset, variable WOFF2 files under
`styles/deep-field/fonts/`, loaded with `font-display: swap` from the app's own
origin. Sizes: 11, 12, 13, 14 (controls), 15, 17, 20, 24, 32, a 34–56 px
display size, and a 28–38 px size for the depth equation. Plate labels drop to
10 px on phones.

### Space, shape, depth, motion

- Space follows a 4 px base: 4, 8, 12, 16, 24, 32, 48, 72.
- Regions are panels (14 px radius, 1 px hairline, a soft lift shadow); controls
  use an 8 px radius; segmented controls and playback buttons are pills.
  Panels never nest inside panels: inside a panel, rows are divided by
  hairlines and wells (inset `rgb(3 5 10 / 45%)` grounds).
- Transitions run 180 ms on `cubic-bezier(0.2, 0, 0, 1)` and only change
  colour, border or a focus ring. There are no entrance animations. Reduced
  motion removes transitions; reduced transparency makes the masthead opaque.

## Layout

The desktop Education page is a spread of panels: a wide evidence column holds
Plate 1 (with the playback toolbar and simulation details) and Figure 2, and a
narrower instrument column holds the controlled inputs (A and B) and the depth
equation with its results table. In the Hypothesis and Interpretation phases,
and in binary lessons, the lesson moves into the instrument column. Phase and
system selectors are wrapped in `:where()` so they win by source order, not by
specificity. Below the spread sit the model tools, the scenario strip, the field
guide and the colophon. The masthead is sticky and translucent on wide screens.

At 860 px and below the page becomes one column with its own reading order:
plate, radius inputs, figure, results, lesson, notes, tools. In Hypothesis and
Interpretation the lesson task comes first, and the masthead scrolls away
instead of staying sticky. At 600 px controls grow to 44 px. At 200% zoom every task reflows without horizontal
page scrolling.

## Components and states

- **Buttons.** A default button is a quiet raised surface; the primary button is
  the accent (one per surface: Compare A and B, Apply parameters, Next phase,
  Run V5 job); Start is an ink-filled pill that turns into an accent outline
  while playing; a quiet action is underlined text.
- **Navigation.** The profile switch (Education/Scientific) is a segmented pill
  because it changes the kind of evidence. The workspace switch
  (Simulation/Guided Labs) and scenario-source tabs use accent underlines. Phases
  form a numbered stepper; the current phase gets an accent rule and a filled
  number.
- **Traces.** A is ink, dashed, and B is the accent, solid. The radius inputs
  and results table repeat these line samples, so colour never carries the
  meaning alone.
- **Fields.** Native controls are used throughout, set as inset wells with a
  3:1 border and an accent focus ring. Range sliders have a hairline track and
  a starlight thumb. A read-only field has a dashed border. An invalid field
  keeps its draft and gets a fault wash and ring.
- **Notes.** Model limits, replay boundaries and hints are margin notes (a 3 px
  left rule on a faint wash), never alert boxes. A fixture replay is always set
  apart with the caution rule and plain text: "Fixture/replay only".
- **Figures.** Every canvas keeps a textual summary. Readouts are a row of
  instrument tiles.
- **Field guide.** Six concept cards (depth, limb darkening, impact parameter,
  duration, transit timing, eclipsing binaries), each with its relation set as
  a displayed equation (`role="math"` plus a spoken label), a short explanation
  that names its simplifying assumptions, and a "Try it" pointer back into the
  experiment. Copy lives in
  `apps/browser/src/presentation/observatory/templates/fieldGuide.ts`.

## Content

Use short, literal labels and calm instructional prose. Name contract versions,
model limits, unavailable capabilities and provenance wherever they affect how a
result is read. Never call an Education output or a checked-in fixture replay a
scientific run.

## Platform adaptation

SwiftUI surfaces keep the same hierarchy, semantics, colour roles and evidence
distinctions while using platform-native navigation, controls, Dynamic Type,
focus behaviour and accessibility APIs. Matching the Browser pixel for pixel is
not a goal; matching it in behaviour and information is.

The Apple app (`apps/apple/App`, shared by the iOS, iPadOS and macOS targets and
by the `OtherlightMac` host) uses Deep Field too:

- Colour roles are named colour sets in `apps/apple/App/Assets.xcassets/DeepField/`,
  one universal value each because the interface is dark only: Space, Surface,
  Surface2, Surface3, Plate, Well, Ink, Ink2, Ink3, OnAccent, Rule, RuleStrong,
  PlateRule, FieldBorder, FigureFrame, Accent, AccentStrong, Starlight, Caution,
  CautionWash, Fault, FaultWash, Pass, PlateInk and PlateInk3. Values match
  `tokens.css` and `figureInk.ts`; change all three together. Both app scenes
  apply `.preferredColorScheme(.dark)`.
- The system serif (New York) stands in for STIX Two for display titles and
  equations, and SF and SF Mono stand in for Atkinson Hyperlegible Next and
  Mono. All three scale with Dynamic Type.
- `apps/apple/App/Views/PlateFigureStyle.swift` (named before the port) holds
  the `DeepField` roles and the shared surfaces: the evidence line with its
  accent or starlight marker, the accent kicker and serif screen title, panels
  (Surface, 1 pt hairline, 14 pt radius), Plate 1 on the Plate ground with
  registration marks and an envelope line, numbered figure sections, margin
  notes (a 3 pt left rule on a neutral, caution or fault wash), inset-well text
  fields with a field border and accent focus ring, the accent primary button
  (one per surface, dark text) and the raised Surface 2 default button.
- Figures draw the model curve in ink (trace A) and accepted samples, the
  current-time marker and O-C points in the accent (trace B), inside a
  figure-frame hairline with inward ticks.
- The field guide's six concept cards follow the Education dashboard and the
  detached-binary lab, with the same copy as the Browser; each relation is set
  as serif text with a spoken accessibility label.
- Navigation stays native: split views, inspectors, tab bars, and system forms.
