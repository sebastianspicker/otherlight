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

## Implementation Rule

Use `renderScene({ step, renderConfig, ... })` as the rendering entrypoint.
`renderScene` requires `drawFrameV3(...)`; legacy `drawFrame(...)` is removed from the standard render path.

## Debug Overlay Contract

Debug overlays must consume V3-native data only.

- Function: `drawDebugOverlayV3(ctx, size, data, observerDir, toggles, opts?)`
- Data type: `DebugOverlayDataV3`
- Source: `SimulationStepV3.debug` + `SimulationStepV3.flux` (renderer-mapped)

Overlay implementations must not read `StepResult` or `StepResult.meta`.

Reference mapping table: `docs/params.md` section `SimulationStepV3 -> DebugOverlayDataV3 mapping`.
