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
| Transit and mutual events               | `eventMarkers[]`                     | Event badges and timeline markers                      |
| LTTE / Shapiro timing                   | `timingMarkers[]`                    | Timing annotation labels                               |
| Visibility fractions                    | `visibilityFractions`                | Planet/moon visibility indicators                      |
| Flux decomposition                      | `fluxComponents`                     | Light-curve component overlay and debug decomposition  |
| Observer-frame geometry                 | `orbitFrames`                        | Observer direction widget and sky-plane geometry lines |
| Numerical uncertainty / missing signals | `uncertaintyFlags[]`                 | Warning badges (scientific mode)                       |

## Rendering Modes

- `rendering.didacticMode = "scientific"`: show decomposition, timing and uncertainty detail.
- `rendering.didacticMode = "didactic"`: prioritize process explanation over numeric density.

Important distinction:

- `rendering.didacticMode = "scientific"` is a rendering/debug presentation toggle only.
- It is not a fail-closed scientific execution mode.
- The repo now has a separate bounded `scientific-browser` runtime contract, and it must continue to be documented and validated as a separate physics/runtime contract rather than inferred from this rendering flag.

For detached-binary lab runs, the plotted flux is a relative light curve
normalized to the combined stellar baseline from the active V4 runtime. That is
a rendering contract, not a claim that the binary surface is already a
research-grade stellar-atmosphere or passband-synthesis model.

Binary Lab is a curated lesson surface, not a general binary-parameter editor.
The app hides the generic transit/exomoon parameter form while that lab is
active so the visible shell stays consistent with the detached-binary contract.

## Implementation Rule

Use `renderScene({ step, renderConfig, ... })` as the rendering entrypoint.
`renderScene` requires `drawFrameV3(...)`; legacy `drawFrame(...)` is removed from the standard render path.

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
