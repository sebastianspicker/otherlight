# Browser frontend

The browser application is a Vite and TypeScript single-page application. It
uses DOM templates, native controls, canvas renderers, and CSS without a
frontend framework or client router.

## Startup and ownership

`src/main.ts` renders the application shell, then loads
`src/app/bootstrap.ts`. The main boundaries are:

- `src/app/` for startup, UI wiring, runtime lifecycle, and profile state
- `src/ui/` for templates, input parsing, and view state
- `src/sim/` for Education runtime composition and observables
- `src/physics/` and `src/photometry/` for numerical models
- `src/render/` for canvases, plots, overlays, and text summaries
- `src/didactics/` for Guided Labs
- `src/science/` for the loopback Scientific client and contracts

Education does not require a network service. The Scientific profile uses only
`http://127.0.0.1:8765` and remains unavailable when the backend capability
contract is absent or incompatible.

## URL state

The application stores shareable browser state in query parameters:

| Parameter  | Values                                  |
| ---------- | --------------------------------------- |
| `mode`     | `simulation`, `lab`                     |
| `ui`       | `essential`, `advanced`                 |
| `source`   | `preset`, `real`                        |
| `scenario` | Stable preset or real-system identifier |
| `lab`      | `preset`, `binary`                      |
| `lesson`   | Stable lesson identifier                |
| `runtime`  | `interactive`, `reference`              |

Unknown or incompatible values resolve to a valid state and produce a status
message. No router dependency is involved.

## DOM contracts

Stable element IDs are part of application wiring and tests. Preserve them
unless every reference is updated. Use classes and `data-*` attributes for
styling and transient state.

Runtime controls precede the visual output in DOM and focus order. Each canvas
belongs to a semantic figure with a linked text summary. Native buttons,
selects, inputs, details elements, and dialogs provide the interaction
semantics.

Input validation retains invalid text, marks the field, reports a specific
error, and leaves the current simulation parameters unchanged. Status regions
announce state changes rather than animation frames.

## Styling

`src/style.css` imports the maintained style layers under `src/styles/`.
`DESIGN.md` defines the component and accessibility rules, and
`docs/design/quiet-observatory.tokens.json` stores the design tokens.

The shell uses light neutral surfaces. Scientific plots and sky geometry use
dark evidence canvases. The interface uses system font stacks and does not load
web fonts.

## Responsive behavior

The application targets desktop and tablet landscape. Narrow layouts retain
the same DOM order and stack controls without hiding required actions.

Responsive behavior is checked manually before release; browser automation is
intentionally not part of the maintained suite.

## Frontend checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The compact suite covers contracts at the scientific API, scenario, workspace,
CSP, and V4 runtime boundaries. Manual assistive-technology checks remain
necessary for canvas
descriptions, announcements, focus movement, and rendered contrast.

The current Chromium 200 percent zoom check reports 8px of horizontal overflow.
This is a known failure, not a supported layout result.

## Performance constraints

- A paused or hidden simulation must not keep a continuous redraw loop.
- Animation work must stay bounded to the active frame.
- Plot history and job polling must remain bounded.
- Runtime paths must not perform synchronous network or filesystem work.

Measure performance with representative release workloads when changing a hot
path; benchmark automation is intentionally not part of the maintained suite.
