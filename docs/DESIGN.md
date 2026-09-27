# Design system

## Direction

The Browser uses a minimal observatory: a matte dark field, warm ivory primary
actions, restrained blue and gold comparison signals, and fine section rules.
The celestial character comes from live geometry and an orbit mark rather than
decoration. Controls and prose are real interface elements; generated mockups
are references only.

## Foundations

The production tokens live in
`apps/browser/src/presentation/styles/quiet-observatory/tokens.css`.

| Role              | Value     | Use                      |
| ----------------- | --------- | ------------------------ |
| Page and evidence | `#0b1319` | Continuous workspace     |
| Control surface   | `#121e27` | Disclosed controls       |
| Primary text      | `#f5f3ee` | Body and headings        |
| Secondary text    | `#b4c0cc` | Supporting copy          |
| Muted text        | `#91a1b1` | Captions and units       |
| Action and focus  | `#93d6f5` | Links and keyboard focus |
| Comparison A      | `#9ddcff` | Dashed reference curve   |
| Comparison B      | `#f3cf87` | Solid alternative curve  |
| Danger            | `#ffaaa1` | Invalid or failed states |

- Use the system UI stack for labels, controls, and prose, and the system mono
  stack for numerical readouts and serialized evidence.
- Space elements on a four-pixel rhythm. Prefer open sections and rails to
  nested cards.
- Keep radii restrained: 6 px for controls, 10 px for grouped surfaces, and
  14 px only for the largest shell regions.
- Establish hierarchy with a border or a compact shadow, not both as
  decoration.

## Layout

The desktop Browser shell keeps scenario controls, evidence, and learning
guidance legible at the same time. Tablet and mobile layouts collapse by task,
preserving document order and the stable DOM identifiers that tests and
accessibility wiring depend on. At narrow widths, controls go full-width before
text or plots are allowed to clip.

Keep document actions above the workspace, and reveal scenario selection below
the primary evidence. Put playback beside the figures, and group live readouts
with the sky view. Browsing sources is distinct from loading a model. Preserve
complete status text, and use disclosure for secondary lesson information. On
compact screens, a section navigation connects the evidence and inspector
without duplicating controls.

At 200% zoom, every core task reflows without horizontal page scrolling. A plot
may keep its own bounded horizontal region only when the same evidence is also
available as text.

## Components and states

- Native form controls are the baseline. Every control needs default, hover,
  focus-visible, active, disabled, and invalid states.
- Invalid authoring text stays available for correction, and the last accepted
  scenario remains active until validation succeeds.
- Buttons speak one shape vocabulary. Warm ivory means Compare; blue marks links
  and keyboard focus.
- Scientific capability, job, cancellation, replay, and error states are
  labelled in text. A missing service never produces an Education substitute.
- Plot colors, line styles, markers, summaries, and tables work together so
  color is never the only carrier of meaning.

## Motion

Product transitions normally run for 140–220 ms on an ease-out curve, and every
one communicates a state change. Do not choreograph page-load entrances. Under
`prefers-reduced-motion: reduce`, remove nonessential movement and keep the
final visible state.

## Content

Use short, literal labels and calm instructional prose. Name contract versions,
model limits, unavailable capabilities, and provenance wherever they affect how
a user reads the result. Never call an Education output or a checked-in fixture
replay a scientific run.

## Platform adaptation

SwiftUI surfaces keep the same hierarchy, semantics, model language, and
evidence distinctions while using platform-native navigation, controls, Dynamic
Type, focus behavior, and accessibility APIs. Matching the Browser pixel for
pixel is not a goal; matching it in behavior and information is.
