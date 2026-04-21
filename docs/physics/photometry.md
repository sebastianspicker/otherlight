# Photometry Model

The repo separates three related surfaces:

- `physical` light-curve state: the native/runtime flux bundle and its decomposition
- `measured` light-curve state: the same bundle after cadence smearing and bounded observer/instrument contamination
- learner-visible overlays: the rendering layer that exposes component traces, landmarks, compare insets, and chromatic or observer badges

Transit / attenuation term:

- A multiplicative attenuation factor F_transit(t) is computed from
  projected occulters on the stellar disk.
- Models include uniform disk, limb darkening, and transmissive occulters.
- Optional advanced path: layered `atmosphereRT` transmission/emission hooks.

Additive flux terms:

- Planet/moon phase curves (reflected + thermal).
- Stellar variability (beaming/ellipsoidal toy terms).
- Forward scattering (optional).
- Ring scattering (optional).
- Bounded refraction shoulders from `atmosphereRT.refraction` (optional).

Composition:

- The active V4 step payload exports a decomposed bundle rather than only one scalar:
  - visible stellar term (`stellarPreTransit`)
  - diagnostic attenuation factor (`transitFactor`)
  - additive planet/moon phase terms
  - forward scattering, ring scattering, and refraction terms
  - total flux
- In the interactive shell, the didactic plot overlays use those pieces to draw the baseline, attenuation, scatter/refraction shoulder, physical-truth vs measured, and compare-A/B lanes.

Multi-band support:

- Limb darkening can be selected per bandpass.
- Transmission can be sampled on a lambda grid.
- `spectralBandpass` provides optional weighted multi-band integration.
- The shipped GitHub/UI surface uses this as a bounded broadband comparison lane: multiple weighted band variants can be overplotted on the light curve, but this is not a full spectroscopic extraction workspace.

Observer-side contamination:

- The measurement lane may add cadence smearing, noise envelopes, data-gap windows, and observer-atmosphere or instrument contamination terms.
- These are teaching aids for separating "physical truth" from "what the observer records." They do not replace a full observational reduction pipeline.

Rendering linkage:

- `docs/rendering/physics-visualization-contract.md` describes how `fluxComponents`, event markers, timing markers, comparison insets, and window overlays become plot/canvas elements.
- The didactic overlay builder lives in `src/app/frameLoopVisualization.ts` and `src/app/visualizationDidactics.ts`.

Related code:

- `src/sim/transitFlux.ts`
- `src/sim/additiveFlux.ts`
- `src/sim/v4/nativeModel.ts`
- `src/sim/v4/nativeEngine.ts`
- `src/photometry/*`
