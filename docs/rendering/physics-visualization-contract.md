# Physics Visualization Contract (V3)

This document defines how physical model outputs map to rendering artifacts.

## Contract

`SimulationStepV3.renderSignals` is the canonical rendering input.  
Renderer modules must not infer physics by re-computing orbital/photometric states.

## Feature-to-Render Matrix

| Physics feature                         | Render signal field                  | Visual artifact                                        |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| Body shape (spherical/oblate)           | `occulterGeometry[]`                 | Circle or ellipse body representation                  |
| Ring system                             | `occulterGeometry[]` (`kind="ring"`) | Ring annulus overlays with inclination/orientation     |
| Transit and mutual events               | `eventMarkers[]`                     | Event badges, plot landmarks, and contact annotations  |
| LTTE / Shapiro timing                   | `timingMarkers[]`                    | Timing badges, curve markers, and scene timing labels  |
| Visibility fractions                    | `visibilityFractions`                | Planet/moon visibility indicators and scene badges     |
| Flux decomposition                      | `fluxComponents`                     | Light-curve component overlays and decomposition lanes |
| Observer-frame geometry                 | `orbitFrames`                        | Observer direction widget and sky-plane geometry lines |
| Numerical uncertainty / missing signals | `uncertaintyFlags[]`                 | Warning badges (scientific mode)                       |

## Visualization View Models

The learner-facing visualization layer now uses explicit render-side view models in addition to `SimulationStepV3.renderSignals`.

### Light-Curve Overlay Contract

`LightCurvePlot` accepts the primary sampled history plus optional overlay state:

- `overlaySeries[]`: extra curves for component decomposition, measured vs physical, chromatic lanes, and A/B comparison
- `markers[]`: event, contact, and timing landmarks keyed in seconds
- `windowOverlays[]`: shaded windows such as deterministic data gaps
- `badges[]`: didactic state summaries such as contamination, chromatic, or compare labels
- `comparisonInset`: delta-only inset series for compare labs

These surfaces are applied via the plot API (`setOverlaySeries`, `setMarkers`, `setWindowOverlays`, `setBadges`, `setComparisonInset`) and must be treated as derived visualization state, not independent physics.

### Scene Didactic Overlay Contract

`Canvas2DRenderer.setDidacticOverlay(...)` accepts a derived scene annotation layer with:

- `lines[]`: geometry cues such as transit chords and path references
- `points[]`: contacts, barycenters, and highlighted reference points
- `badges[]`: semantic tags such as visibility, ring orientation, or bounded timing cues
- `ghosts[]`: compare or epoch geometry outlines

This overlay is sourced from the active `SimulationStepV3`, didactics compare state, and bounded timing/measurement diagnostics. The scene renderer must not invent unsupported physics to populate it.

### Compare-Lab Contract

Didactic compare runs may emit a visual bundle with:

- paired curve overlays
- a delta inset
- scene ghosts
- compare badges

Reports may export these visual labels, but the canonical rendered state remains the live plot/canvas pair.

## Rendering Modes

- `rendering.didacticMode = "scientific"`: show decomposition, timing and uncertainty detail.
- `rendering.didacticMode = "didactic"`: prioritize process explanation over numeric density.

Important distinction:

- `rendering.didacticMode = "scientific"` is a rendering/debug presentation toggle only.
- It is not a fail-closed scientific execution mode.
- `scientific-browser` is a strict V4 compatibility-validation profile. The
  user-facing Scientific workspace uses the separate V5 contract and
  loopback backend; neither execution boundary may be inferred from this
  rendering flag.

For detached-binary lab runs, the plotted flux is a relative light curve
normalized to the combined stellar baseline from the active V4 runtime. That is
a rendering contract, not a claim that the binary surface is already a
research-grade stellar-atmosphere or passband-synthesis model.

Binary Lab is a curated lesson surface, not a general binary-parameter editor.
The app hides the generic transit/exomoon parameter form while that lab is
active so the visible shell stays consistent with the detached-binary contract.

## Implementation Rule

Use `Canvas2DRenderer.drawFrameV3(...)` from the app frame-loop path as the rendering entrypoint.
Legacy `drawFrame(...)` is removed from the standard render path.

Didactic overlays must be driven from app/frame-loop state, not from ad hoc DOM mutations. The frame loop is responsible for synchronizing:

- active curve history
- derived overlay series and badges
- compare-lab visual state
- scene didactic overlays

## Debug Overlay Contract

Debug overlays must consume V3-native data only.

- Function: `drawDebugOverlayV3(ctx, size, data, observerDir, toggles, opts?)`
- Data type: `DebugOverlayDataV3`
- Source: `SimulationStepV3.debug` + `SimulationStepV3.flux` (renderer-mapped)

Overlay implementations must not read `StepResult` or `StepResult.meta`.

`bPlanet` and `bMoon` in the overlay/debug payload denote front-of-star
projected impact parameters only. They should be omitted when the body is not
in front of the stellar disk plane.

Reference mapping table: `docs/params.md` section `SimulationStepV3 -> DebugOverlayDataV3 mapping`.
