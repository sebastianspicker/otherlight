# Interface design

Otherlight uses the Quiet Observatory interface system. The application shell
uses light laboratory surfaces, while sky geometry and plots use dark evidence
canvases.

The implementation is in `src/styles/`. The token reference is
`docs/design/quiet-observatory.tokens.json`.

The maintained static references are the
[HTML mockup](docs/design/mockup-quiet-observatory.html) and its
[PNG rendering](docs/design/mockup-quiet-observatory.png).

## Interface layers

| Layer           | Contents                                                   | Surface         |
| --------------- | ---------------------------------------------------------- | --------------- |
| Identity band   | Product name and Education or Scientific profile selection | Observatory ink |
| Command strip   | Scenario, status, runtime actions, and speed               | White           |
| Workspace       | Evidence figures and inspector                             | Lab paper       |
| Evidence canvas | Sky geometry and light curve                               | Plot ink        |
| Inspector       | Parameters, display, timing, and lesson controls           | White           |

Education is the default profile. Scientific selection pauses Education and
checks the loopback backend capability contract. The interface must not label
an Education calculation as a Scientific result.

## Color

The maintained base tokens are:

| Token             | Value     | Use                                  |
| ----------------- | --------- | ------------------------------------ |
| `observatory-ink` | `#081923` | Identity band and dark context       |
| `deep-ocean`      | `#123142` | Secondary structure on dark surfaces |
| `shell`           | `#eef3f4` | Page background                      |
| `surface`         | `#ffffff` | Working regions                      |
| `surface-soft`    | `#f7fafb` | Secondary controls                   |
| `text`            | `#12242c` | Primary text                         |
| `text-2`          | `#3a525c` | Secondary text                       |
| `text-3`          | `#5a717b` | Metadata                             |
| `border`          | `#c5d2d8` | Structural separation                |
| `border-soft`     | `#d7e1e6` | Secondary separation                 |
| `action`          | `#087f73` | Primary action, selection, and focus |
| `action-ink`      | `#045248` | Text on action-soft                  |
| `action-soft`     | `#e6f5f3` | Selected and status backgrounds      |
| `world`           | `#315fba` | Product mark and scientific series   |
| `signal`          | `#c48a1f` | Event markers                        |
| `signal-soft`     | `#fbf3e3` | Event background                     |
| `success`         | `#147a45` | Successful status                    |
| `warning`         | `#8a5a00` | Warning status                       |
| `error`           | `#b42318` | Error status                         |
| `plot`            | `#09151d` | Evidence canvas                      |

Color never carries state by itself. Selection also uses `aria-current`, a
border, an underline, or another non-color indicator.

## Typography and spacing

Use the system sans-serif stack for interface text and the system monospace
stack for numerical values and compact data. Do not add a web-font dependency.

- Body text is at least 15px.
- Labels are at least 13px.
- Responsive canvas annotations are at least 11px.
- Spacing uses 4, 8, 12, 16, 24, and 32px increments.
- Control height is at least 36px and at least 44px for coarse pointers.
- Borders establish hierarchy. Shadows are limited to dialogs and sticky
  separation.

## Header and command strip

The identity band contains the Otherlight name, the descriptor
`Exoplanet learning & scientific modeling`, profile navigation, and Education
mode navigation.

The command strip contains the context selectors, `#appStatus`, runtime
actions, and speed control. It precedes the workspace in DOM and focus order
and may wrap without reordering controls.

Use these labels consistently:

- `Parameter depth`
- `Teaching scenario`
- `Catalog system`
- `Simulation`
- `Guided Labs`
- `Run transit`
- `Reset time`
- `Clear curve`
- `Compare scenarios`

## Evidence and inspector

Desktop layouts place evidence figures beside the inspector. Narrow layouts
stack the inspector after the evidence while preserving DOM order.

Each canvas has:

- a visible heading and caption
- a linked text summary of the current state
- a bounded size that does not depend on viewport height alone
- a data export path where the displayed data is exportable

The inspector owns parameters, display settings, timing output, and Guided Lab
controls. The Scientific workspace presents availability, request state,
result metadata, and provenance separately from Education controls.

## Forms and errors

Every field has a visible label, unit when applicable, and a specific error
message. Invalid submitted text remains visible. The field uses
`aria-invalid`, the error summary identifies the failure, focus moves to the
first invalid field, and the active model remains unchanged.

Use `role="status"` for progress and neutral state. Use `role="alert"` for
actionable failures. Disable only controls affected by the failure.

Use native `<dialog>` for consequential loss of unapplied changes. The actions
must state the outcome, such as `Keep editing` and `Discard edits and load`.

## Guided Labs

Show one learning phase at a time with progress, question, response, evidence,
result, and next action. Hide unavailable sections. Explicit phase navigation
moves focus to the phase heading, and result checks produce one concise
announcement.

## Accessibility

- Text and interface surfaces must meet WCAG 2.2 AA contrast.
- Keyboard focus uses a visible 3px teal outline with an offset.
- Selected navigation uses a non-color indicator.
- Coarse-pointer targets are at least 44px.
- `prefers-reduced-motion` disables nonessential transitions.
- Forced-colors mode preserves selected navigation and primary action state.
- Canvas figures expose linked text summaries.
- Status and error regions use the appropriate live-region role.

## Motion

Motion communicates a state change and normally lasts 150 to 200 milliseconds
with an ease-out curve. Do not add page-load sequences, ambient animation,
parallax, or decorative loops. A paused or hidden simulation must stop its
continuous redraw work.

## Exclusions

Do not add gradient text, glass blur, broad shadows, nested card grids, custom
scrollbars, decorative space backgrounds, photorealistic wallpaper, repeated
entrance animation, raw implementation identifiers, vague action labels, or a
product-specific theme toggle.
