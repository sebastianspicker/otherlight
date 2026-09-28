# Otherlight Browser

The Browser is the primary Otherlight product: a single Vite TypeScript
application split into domain, application, infrastructure, presentation, and
composition layers. It is one modular monolith, not a set of separately
published packages.

Run these from the repository root:

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm typecheck:compat
pnpm architecture:check
pnpm build
```

## How a scenario flows

Education follows one canonical route:

```text
BrowserScenarioDraft -> EducationScenarioV4 -> V4 Education runtime
```

Scientific-profile actions compile the supported V4 subset into a strict V5
request and call only a compatible loopback service. Education output never
stands in for an unavailable service result.

The GitHub Pages build makes no V5 request. It displays a validated,
deterministic projection of the checked-in
`contracts/science-v5/contract-cases.json#validForwardResult` fixture, labelled
as replay-only and unaffected by the current form inputs.

For dependency and data-flow rules see the
[architecture guide](../../docs/ARCHITECTURE.md); for interaction,
accessibility, rendering, and evidence conventions see the
[interface guide](../../docs/frontend.md).

## What the interface does

The Education observatory pairs the live sky and light curve with a controlled
planet-radius comparison. A is the accepted model; B is a temporary copy with
only its radius changed. Hypothesis and Interpretation reuse the existing lesson
phases and response store, entering the Kepler depth step for the Simulation
radius task while preserving Guided Lab progression. Compare centers the preview
on a bounded Education transit estimate when one is available, and reports
explicitly when it is not. Clear comparison restores the component traces and
event annotations.

Open and Save workspace stay in the masthead beside the visible profile and
Guided Labs switches, and More experiments opens scenario and catalog
selection. Playback sits beside the sky, and model parameters, diagnostics, and
display controls stay in disclosures. Narrow screens stack the evidence and
inputs. Invalid B input stays available for correction. B and its curves are
transient: save the lesson report for comparison evidence, and export the active
model's plotted samples separately as CSV.

## Rendering and performance

Fixed-window previews reuse their 256-point series until scenario/runtime,
measurement, display, reset, seek, or clear invalidation. Chromatic Education
overlays run in a module worker at up to 10 Hz, independently of animation. The
last valid same-scenario overlay stays visible while updates run, and an
overlay-specific warning reports worker failure. Hidden tabs stop sampling, and
teardown terminates the worker. Both the ordinary and Pages builds permit
same-origin workers through their CSP.

Run `pnpm benchmark:browser` for work-count assertions and an informational JSON
report in `test-results/browser-benchmark.json`. See
[performance validation](../../docs/performance.md) for workloads and manual
responsiveness checks.
