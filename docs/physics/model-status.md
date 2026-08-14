# Physics Model Status

This document is the human-readable companion to
[`model-registry.json`](./model-registry.json). The registry is authoritative
for capability status and automated coverage; [`../references.bib`](../references.bib)
contains the cited bibliography.

## Status meanings

- `research-validated`: the equation and implementation have an explicit
  validity domain and independent scientific evidence. For immutable constants,
  this means agreement with the cited reference standard and value class; it
  does not validate a downstream model or output.
- `bounded-approximation`: physically derived within a narrow stated domain,
  but not a general research model.
- `educational`: a phenomenological preview model that must not enter a
  research-labelled result.
- `unavailable`: declared contract only; execution must fail closed.

## Current status

| Model ID                                    | Status                | Current contract                                                                                                                                                                                           | Evidence needed before promotion                                                                        |
| ------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `constants.si.iau`                          | research-validated    | CODATA 2022 measured G plus explicitly labelled exact IAU and conventional astronomical constants                                                                                                          | Preserve value class and provenance in every V5 manifest.                                               |
| `dynamics.kepler.elliptic`                  | bounded-approximation | Bound two-body ellipses; V5 enforces period/mass closure                                                                                                                                                   | Add independent element-to-state fixtures and uncertainty handling before promotion.                    |
| `coordinates.orbit.projection`              | bounded-approximation | Defined right-handed inertial/sky transforms, without an ICRS mapping                                                                                                                                      | Add explicit V5 frame metadata, ICRS mapping, and independent fixtures.                                 |
| `dynamics.barycenter.planet-moon`           | bounded-approximation | Algebraic pair barycentric split; V5 requires masses and verifies total position/momentum invariants                                                                                                       | Retain fail-closed V5 validation and add an independent benchmark before promotion.                     |
| `dynamics.nbody.newton-plummer`             | bounded-approximation | Compatibility Verlet integrator                                                                                                                                                                            | V5 uses error-controlled barycentric integration and finite-radius contact detection and rejection.     |
| `dynamics.satellite.hill-stability`         | bounded-approximation | Domingos empirical prograde/retrograde warning, including the retrograde mixed-eccentricity term, no duplicate `(1-e_p)` factor, and fail-closed fit-domain messaging                                      | Keep diagnostic-only; use direct dynamics outside the cited restricted-three-body sample domain.        |
| `timing.exomoon.ttv-tdv`                    | bounded-approximation | Synthetic event metrics                                                                                                                                                                                    | Derive V5 events from integrated dense state and explicit estimators.                                   |
| `relativity.precession.schwarzschild-1pn`   | bounded-approximation | Central weak-field precession                                                                                                                                                                              | Add mutually consistent force-level V5 1PN model.                                                       |
| `relativity.timing.roemer-shapiro`          | bounded-approximation | Compatibility relative delay                                                                                                                                                                               | Add V5 time scales, ephemeris provenance, and arrival-time separation.                                  |
| `relativity.nbody.star-centric-1pn-preview` | educational           | Star-centric test-particle 1PN acceleration with a first-order end-velocity estimate                                                                                                                       | Replace with a validated force-level integrator before any research use.                                |
| `photometry.transit.opaque-disks`           | bounded-approximation | Intensity-weighted union geometry without an a-posteriori integration-error estimate                                                                                                                       | Add error-estimating V5 integration and independent ppm fixtures before promotion.                      |
| `photometry.limb-darkening.claret`          | bounded-approximation | Exact law for supplied coefficients                                                                                                                                                                        | Remove hand-derived coefficients from research mode.                                                    |
| `photometry.transit.transmissive`           | bounded-approximation | Radial input transmission                                                                                                                                                                                  | V5 consumes radiative-transfer effective radii/spectra.                                                 |
| `photometry.phase.lambert-thermal`          | educational           | Broadband teaching phase curve                                                                                                                                                                             | Replace with energy-balance and spectral passband models.                                               |
| `photometry.scattering.hg-preview`          | educational           | HG/Gaussian amplitude surrogate                                                                                                                                                                            | Add optical-depth and finite-star single-scattering model.                                              |
| `photometry.stellar.preview`                | educational           | Relative blackbody/harmonic preview                                                                                                                                                                        | Use versioned atmosphere intensities and physical variability PSDs.                                     |
| `measurement.exposure-noise.preview`        | bounded-approximation | Synthetic measured lane                                                                                                                                                                                    | V5 uses electrons, calibrated covariance, and order-independent RNG.                                    |
| `observables.rv-astrometry.preview`         | bounded-approximation | Positive-receding RV and linear sky-plane offsets                                                                                                                                                          | Require explicit target and distance; validate angular photocentre output independently.                |
| `runtime.v4.kepler-preview`                 | educational           | Active interactive runtime                                                                                                                                                                                 | Keep as preview and reject unsupported scientific capability claims.                                    |
| `runtime.v5.scientific-forward`             | bounded-approximation | Capability-gated barycentric Newtonian DOP853 radial velocity with bounded, fail-closed certification of the accepted dense numerical trajectory against finite-radius contact and complete run provenance | Keep every unimplemented observable unavailable; require independent release evidence before promotion. |

## Runtime truth boundary

The shipped V4 path constructs Kepler snapshots and native preview photometry.
It does not execute the compatibility N-body or LTTE/Shapiro solvers. V4 output
therefore remains educational even when strict validation is selected. The
compatibility `stepSystem` path remains maintained because tests, didactics,
benchmarks, and parity checks still call it, but it is not the canonical V5
research implementation.

No computed model may move to `research-validated` merely because it agrees
with itself at higher numerical resolution. Promotion requires an analytic
invariant, convergence evidence, and an independent implementation, published
table, or published-system benchmark with a physically justified tolerance.

The status is about evidential maturity, not whether an equation is written
correctly. Kepler, frame rotation, and barycentric split remain physically
defined and tested within their stated domains, but this alpha deliberately
does not call those implementations independently research-validated yet.
