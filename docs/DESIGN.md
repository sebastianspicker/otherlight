# Design system

## Direction: Plate & Figure

Astronomy keeps two kinds of visual evidence: the photographic **plate**, a dark
picture of light against the sky, and the printed **figure**, ink lines on
paper with a framed axis and a numbered caption. The Browser uses exactly that
pair. The sky view is Plate 1: always dark, with registration marks and an
envelope line. The light curve is Figure 2: a journal figure with a closed frame
and inward ticks. Everything else is paper, ink and rules, set like the methods
section of a paper. A running head under the masthead always states which kind
of evidence is on screen.

## Foundations

Tokens live in `apps/browser/src/presentation/styles/plate-figure/tokens.css`.
Canvas figures mirror the same roles in
`apps/browser/src/presentation/render/canvas/figureInk.ts`; change both
together.

| Role          | Light     | Dark      | Use                                                 |
| ------------- | --------- | --------- | --------------------------------------------------- |
| Paper         | `#f3efe6` | `#131416` | Page and figure ground                              |
| Paper, raised | `#fbf9f4` | `#1c1d20` | Fields and default buttons                          |
| Paper, sunk   | `#e8e3d7` | `#0e0f10` | Serialized output, model boundary                   |
| Ink           | `#17191b` | `#ebe6db` | Text, rules, primary actions, focus, trace A        |
| Ink 2 / 3     | `#45484b` | `#bbb6ab` | Supporting copy / captions and units (both ≥ 4.5:1) |
| Blue pencil   | `#1f55b3` | `#8fb3ff` | "Your change": trace B, current phase, focus bars   |
| Caution       | `#72500a` | `#e2bf76` | Model notes and replay boundary, on a pale wash     |
| Fault         | `#9e2a2b` | `#ff9f96` | Invalid input and failures, on a pale wash          |
| Pass          | `#2b6a3e` | `#8fd0a0` | Passed lesson checks                                |
| Plate         | `#0c0f13` | `#0c0f13` | The sky canvas in both themes                       |

The page follows the operating-system colour scheme. Every role exists in both
themes, and the plate never changes.

### Type

- **STIX Two Text** sets headings, figure numbers and captions, lesson prose, and
  the depth equation. STIX is the scientific publishers' face; its italic is
  correct for variables.
- **Atkinson Hyperlegible Next** sets the interface: labels, controls, help.
- **Atkinson Hyperlegible Mono** sets readouts, tick labels and serialized
  evidence, with tabular figures and a slashed zero.

All three are OFL-licensed, subset, variable WOFF2 files under
`styles/plate-figure/fonts/`, loaded with `font-display: swap` from the app's own
origin. The scale steps by about 1.25 from 15 px: 12, 13, 15, 17, 20, 26, 34,
and a 34–52 px display size.

### Space, shape, motion

- Space follows a 4 px base: 4, 8, 12, 16, 24, 32, 48, 64.
- Sections are separated by rules, not cards. A 1 px ink rule opens a major
  section; hairlines divide rows.
- Controls use a 3 px radius, and sections have none. Nothing has a drop
  shadow.
- Transitions run 160 ms on `cubic-bezier(0.2, 0, 0, 1)` and only change
  colour or border. There are no entrance animations. Reduced motion removes
  transitions entirely.

## Layout

The desktop Education page is a spread: an eight-column main column holds Plate 1
and Figure 2, and a four-column margin column, ruled on its left edge, holds the
controlled inputs (A and B), the depth equation and its results table. In the
Hypothesis and Interpretation phases, and in binary lessons, the lesson moves
into the margin column. Phase and system selectors are wrapped in `:where()` so
they win by source order, not by specificity.

At 860 px and below the page becomes one column with its own reading order:
plate, radius inputs, figure, results, lesson, notes, tools. In Hypothesis and
Interpretation the lesson task comes first. Phones get 44 px controls. At 200%
zoom every task reflows without horizontal page scrolling.

## Components and states

- **Buttons.** A default button is ruled paper, a primary button is solid ink
  (one per surface: Compare A and B, Apply parameters, Next phase, Run V5
  job), and a quiet action is underlined text. A disabled button loses its fill
  and uses ink 3.
- **Navigation.** The profile switch (Education/Scientific) is a segmented
  control because it changes the kind of evidence. The workspace switch
  (Simulation/Guided Labs) and scenario-source tabs use underlines. Phases form
  a numbered stepper, and the current phase gets a blue-pencil rule.
- **Traces.** A is ink, dashed, and B is blue pencil, solid. The radius inputs
  and results table repeat these line samples, so colour never carries the
  meaning alone.
- **Fields.** Native controls are used throughout. A read-only field has a
  dashed border. An invalid field keeps its draft and gets a fault wash and a
  2 px fault edge.
- **Notes.** Model limits, replay boundaries and hints are ruled margin notes
  (a 3 px left rule on a wash), never alert boxes. A fixture replay is always
  set apart with the caution rule and plain text: "Fixture/replay only".
- **Figures.** Every canvas keeps a textual summary. Figure captions are set in
  the interface face; figure numbers are set in the serif italic.

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

In practice:

- Colour roles are named colour sets in `apps/apple/App/Assets.xcassets/PlateFigure/`
  with the same light and dark values as the Browser tokens. The app tint is blue
  pencil.
- The system serif (New York) stands in for STIX Two, and SF and SF Mono stand
  in for Atkinson Hyperlegible Next and Mono. All three scale with Dynamic Type.
- `apps/apple/App/Views/PlateFigureStyle.swift` holds the shared surfaces: the
  running head, Plate 1's dark frame with registration marks, numbered figure
  sections with a 1-point ink rule instead of cards, ruled margin notes, ruled
  text fields, and the ink button used for one primary action per screen.
- Canvas figures draw a closed frame with inward ticks, ink curves, and
  blue-pencil markers. The sky is a limb-darkened star on the plate.
- Navigation stays native: split views, inspectors, tab bars, and system forms.
