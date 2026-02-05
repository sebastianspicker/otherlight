# Roadmap (Physics + Product)

This roadmap captures known scientific gaps, product improvements, and
engineering refactors to implement later. It is divided by priority and
includes file references for each item.

## Priority: High

1. TTV/TDV from fully coupled dynamics (all bodies)

Status:

- Currently TTV/TDV is fully dynamic only for planet-moon coupling.
- Star reflex and multi-body coupling across all objects are not used in
  the diagnostics pipeline.

Work:

- Extend kinematics and diagnostics to compute sky-plane speeds and timing
  from the full N-body state (all bodies, including star reflex).
- Provide consistent definitions of reference epochs and derived timing
  observables for multi-body systems.

Code anchors:

- `src/sim/dynamics.ts`
- `src/sim/diagnostics.ts`
- `src/sim/kinematics.ts`

2. Atmosphere physics (transmission, scattering, emission, clouds)

Status:

- Atmosphere is a simplified transmissive halo with tau scaling.
- No scattering, emission, clouds/haze, or temperature-pressure profiles.

Work:

- Add wavelength-dependent opacities, scattering, and emission.
- Support cloud/haze layers with configurable particle sizes and optical depth.
- Implement a simple temperature profile (1D) for emission.

Code anchors:

- `src/experimental/photometry/transitTransmission.ts`
- `src/sim/transitFlux.ts`
- `src/core/typesPhotometry.ts`

## Priority: Medium

3. Stellar physics (spots, rotation, activity)

Status:

- Spot evolution and stellar variability are toy models.
- No granulation, differential rotation, or activity cycles.

Work:

- Add granulation noise model (PSD-driven or OU bank).
- Implement differential rotation and latitude-dependent spot drift.
- Add activity cycles (time-varying spot coverage).

Code anchors:

- `src/photometry/transitUniformSpots.ts`
- `src/photometry/stellarVariability.ts`

4. Limb darkening and spots from stellar parameters

Status:

- Limb darkening is manual coefficients; no derivation from stellar params.
- Multi-band is manual input only.

Work:

- Add a pipeline to derive limb-darkening coefficients from Teff/logg/FeH and
  bandpass (e.g., precomputed tables or external model integration).
- Connect spot/facula contrast to stellar parameters and bandpass.

Code anchors:

- `src/photometry/limbDarkening.ts`
- `src/ui/params.ts`

5. Thermal model (energy balance)

Status:

- Phase-curve + thermal inertia is a 1-pole filter (phenomenological).

Work:

- Implement energy balance with insolation, albedo, emissivity, and heat
  transport (day/night redistribution).
- Optionally add latitudinal band model for thermal phase curves.

Code anchors:

- `src/photometry/phaseCurve.ts`

6. Non-spherical bodies beyond silhouette

Status:

- Oblateness and rings affect transit silhouette only.
- No gravity darkening or shape-induced emission/reflection changes.

Work:

- Add gravity darkening for fast rotators.
- Modify phase/reflection models based on oblate shape and ring scattering.

Code anchors:

- `src/photometry/occulterEllipse.ts`
- `src/sim/occulters.ts`

## Priority: Low

7. Multi-band photometry for additive flux

Status:

- Multi-band transmission and LD are partial.
- Additive reflection/emission remains single-band.

Work:

- Extend phase-curve and forward-scattering models to support a bandpass grid.
- Integrate over bandpass and apply band-dependent albedo/emissivity.

Code anchors:

- `src/sim/transitFlux.ts`
- `src/photometry/phaseCurve.ts`

8. Instrument systematics realism

Status:

- Systematics and correlated noise are simplified.

Work:

- Add realistic time-correlated drifts, pointing jitter, and pixel-response
  non-uniformity tied to a 2D centroid time series.
- Implement read noise, non-linearity, and saturation.

Code anchors:

- `src/photometry/instrumentNoise.ts`
- `src/app/noise.ts`
- `src/core/instrumentNoiseTypes.ts`

## Product and UX Enhancements

- HR diagram mapping: star brightness/color derived from spectral type/Teff.
- Canvas visualization toggles for spots, dust, and ring shadowing.
- Difficulty modes: Beginner / Intermediate / Expert / Debug (feature gating).
- Load real exoplanet/exomoon systems with curated datasets.
- "Black box" mode: show light curve only, then reveal sky-plane view.
- Binary systems: star-star, star-star-planet, star-star-planet-moon.
- Habitable zone indicators for planet and moon.
- Didactic improvements: tooltips (i) for every parameter with short physical
  explanations and units.
- Drag bodies on their orbits with the mouse (UI interaction).

## Engineering Refactors and Deduplication

- Consolidate orbit sampling and barycentric splitting helpers
  (reduce duplication between kinematics, diagnostics, and sampling).
- Unify photometry integrators behind a shared interface for uniform/LD/patched
  cases to reduce branch complexity.
- Extract common validation utilities for dynamics and photometry.
- Add regression tests for:
  - circle overlap area
  - limb darkening admissibility
  - N-body energy drift
  - LTTE/Shapiro timing convergence

## Open Questions / Assumptions

- What level of physical fidelity is required for the N-body GR terms?
- Should stellar variability be tied to physical rotation and spot geometry,
  or remain phenomenological?
- Do we want bandpass-resolved additive flux in the near term, or only for
  transmission and LD?
- How much UI complexity is acceptable for "Beginner" mode?
- What data sources should be used for real system presets?
  (exoplanet.eu, NASA Exoplanet Archive, or curated local JSON)
