# Browser product and interface guide

The Browser serves STEM learners, educators, and technical explorers. It is a
Vite TypeScript single-page application for direct simulation and Guided Labs,
and its interface should keep accepted state, pending input, active profile,
warnings, busy work, and evidence visible without asking anyone to guess at
hidden state.

Learners need clear cause and effect with immediate feedback. Educators need
reproducible scenarios and dependable exports. Technical users want dense
controls, diagnostics, and explicit validation.

## Structure

`apps/browser/index.html` loads `src/main.ts`, which renders the shell and starts
`src/composition/bootstrap.ts`. Presentation code under
`apps/browser/src/presentation/` is grouped by feature: `shell/`, `scenario/`,
`playback/`, `timing/`, `labs/`, `observatory/`, `science/`, and `workspace/`
each own their controllers and HTML templates. `render/` holds the pure canvas
renderers, and `presentation/styles/style.css` is the single style entry.

For the dependency rules and the full data flows, see
[Architecture](ARCHITECTURE.md). DOM access, styling, browser events, HTTP, and
persistence do not belong in the domain layer.

## Interaction and accessibility

Core workflows target WCAG 2.2 AA.

- Keep invalid input text available for correction while the accepted scenario
  state stays unchanged.
- Announce meaningful state changes, not animation frames.
- Keep unavailable scientific actions explicit. Education output and checked-in
  fixtures are not fallbacks for V5 execution.
- Preserve the stable control and element identifiers that tests, labels, focus
  management, and live regions rely on.
- Reach for native controls and semantic landmarks first. Keep reading, focus,
  and interaction order logical at narrow widths and at 200% zoom.
- Support keyboard-only use, visible focus, reduced motion, coarse pointers, and
  color-independent plot encodings.
- Pair every canvas evidence view with a semantic figure and a textual summary.

Simulation and Guided Labs are peer workflows. Guidance should explain
prediction, observation, comparison, and recovery without hiding expert controls
or validation details.

Scenario-source buttons choose which native selector is visible; they do not
load a model. Selecting a scenario commits through the existing dirty-edit
guard, and URL history and workspace restoration keep the visible source in sync
with the accepted context. Status messages wrap in full, including their
recovery actions. A playback button's text is also its accessible name.

The Education observatory uses a two-column experiment surface: sky and playback
beside the radius inputs, then the light curve and geometric reference. A is
read-only accepted state, and Adjust model opens the full authoring controls. B
changes one radius in an independent Education runtime. Comparing pauses
playback and focuses the curves around an estimated transit; because the search
is bounded it can miss short or eccentric events, so "nothing found" is a
recoverable state rather than proof that no transit exists. Clearing the
comparison restores the detailed overlays.

Hypothesis, Experiment, and Interpretation map to the existing lesson phases.
Entering the radius task from Simulation selects the Kepler depth step on the
first explicit phase action. Guided Labs and other selected lessons keep their
current step, and neither initial rendering nor workspace restoration moves it.
Unavailable phase categories are disabled. Responses keep their
lesson/step/phase keys, and prose stays ungraded. A visible action downloads the
lesson report; saving a workspace includes accepted state and responses but
excludes B, curve histories, and run artifacts. The light-curve CSV exports the
active model's plotted series, not both comparison overlays.

The masthead keeps document actions and shows the Education/Scientific profile
switch and the Simulation/Guided Labs switch in plain view. A running head below
it states which kind of evidence is on screen. More experiments opens scenario
and catalog selection. Model
controls, playback settings, and diagnostics use native disclosures. At narrow
widths figures and inputs stack, and focus and invalid drafts stay available.

## Profiles and evidence

Education executes locally in the Browser. Scientific actions first compile a
supported `EducationScenarioV4` subset to strict V5, then use a compatible
loopback service. Missing capability must stay a visible unavailable state.

GitHub Pages performs no V5 request. It shows a deterministic projection of a
shared checked-in result fixture, explicitly labelled as a replay with no
execution. The current input controls are prospective local-run inputs and do
not alter that fixture.

Canvas, charts, diagnostics, exports, fixture replays, and screenshots are all
evidence views. Each must identify its source and must not imply research
calibration beyond [the model registry](physics/model-registry.json). Teaching
overlays derive from accepted model state, and a scientific result is rendered
only after the loopback adapter validates a terminal result.

## Visual language

Keep controls quiet and the scientific evidence primary. Use local assets and
the self-hosted typefaces described in the [design system](DESIGN.md); never
load fonts or images from a third party. Avoid ornamental motion, effects that obscure state changes, and
continuous redraw work while a simulation is paused or hidden. Dense layouts
suit comparison; explanatory space suits a learner working through a causal
relationship.

Skip generic dashboard ornament such as gradient text, broad shadows, ambiguous
pill readouts, or decorative glass effects. Replace a native control with a
custom version only when the interaction and accessibility cost is justified.

The maintained visual rules are in the [design system](DESIGN.md).

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:compat
pnpm test
pnpm architecture:check
pnpm build
```

Run `pnpm smoke:pages` whenever you change deployment mode, asset paths, the
Content Security Policy, or hosted Scientific behavior.
