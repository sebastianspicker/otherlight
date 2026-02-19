# Exoplanet-Exomoon Transit Simulation

![CI](https://github.com/sebastianspicker/exoplanet-exomoon-simulation/actions/workflows/ci.yml/badge.svg)

Interactive, time-based 2D sky-plane visualization of a star-planet-moon system
with synthetic transit photometry, phase curves, stellar variability, and
instrument-style measurement effects. The core is a deterministic stepper
`stepSystem(params, tSec)` that returns geometry and flux diagnostics for
rendering and plotting.

This repo supports both:

- Kinematic (Kepler) motion with barycentric splitting, and
- N-body dynamics with star reflex motion and optional perturbers.

## What

An interactive, browser-based simulator for exoplanet–exomoon transits with a deterministic
physics core and visualization of sky-plane geometry plus light-curve diagnostics.

## Why

Built for didactic exploration of transit geometry, limb darkening, and coupled dynamics
without requiring a heavy scientific stack.

## Requirements

- Node.js 18+ (recommended)
- pnpm 9 (recommended, lockfile in repo)
- npm (supported)

## Quick start

Install (recommended):

```
pnpm install --frozen-lockfile
```

Run dev server:

```
pnpm dev
```

Open `http://localhost:5173` in your browser.

Alternative (npm):

```
npm install
npm run dev
```

Note: the repo pins dependencies via `pnpm-lock.yaml`, so pnpm is the reproducible path.

## Features (short list)

- Sky-plane projection with observer-direction control.
- Transit photometry: uniform disk, limb darkening, and transmissive occulters.
- Oblate bodies and rings in the transit silhouette.
- Phase curves with thermal inertia, albedo, and redistribution controls.
- Stellar activity and brightness patch evolution.
- Multi-band limb darkening and atmosphere transmission sampling.
- N-body dynamics (star + planet + moon + perturbers).
- Relativity-inspired timing: light-time (Roemer-like) and Shapiro delay,
  plus GR precession (Kepler-derived or 1PN in N-body).
- Optional measurement layer: finite exposure smearing and instrument systematics.

## Feature status (scope)

This section is the **source-of-truth** for what is implemented vs. intentionally simplified.

| Area                                | Status                       | Notes                                                                | Code anchors                                                                    |
| ----------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Kepler kinematics                   | Implemented                  | Elliptic solver + sky-plane projection                               | `src/physics/kepler.ts`, `src/sim/kinematics.ts`                                |
| N-body dynamics                     | Implemented                  | Fixed/adaptive Verlet, star reflex, optional perturbers              | `src/sim/dynamics.ts`, `src/sim/nbody/*`                                        |
| Transit photometry (uniform)        | Implemented                  | Union masking, analytic 1-occult path                                | `src/photometry/transitUniform.ts`                                              |
| Transit photometry (limb darkening) | Implemented                  | Quadratic + generic integrator                                       | `src/photometry/transitLimbDarkened.ts`                                         |
| Oblateness + rings (silhouette)     | Implemented                  | Affects transit silhouette                                           | `src/sim/occulters.ts`, `src/photometry/occulterEllipse.ts`                     |
| Atmosphere transmission             | Implemented + advanced hooks | Legacy halo + optional layered `atmosphereRT`                        | `src/sim/transitFlux.ts`, `src/photometry/transitTransmission.ts`               |
| Phase curves (planet/moon)          | Implemented                  | Thermal inertia + optional advanced thermal scaling                  | `src/photometry/phaseCurve.ts`, `src/sim/additiveFlux.ts`                       |
| Stellar variability + patches       | Implemented                  | Legacy 2D patches + optional surface projection path                 | `src/photometry/transitUniformSpots.ts`, `src/photometry/stellarSurface.ts`     |
| Relativity (LTTE/Shapiro/GR)        | Implemented (approx.)        | Point-mass + star-centric 1PN-style correction                       | `src/physics/relativity.ts`, `docs/physics/relativity.md`                       |
| Measurement layer (smearing/noise)  | Implemented                  | OU/1f + detector realism hooks (PRNU/nonlinearity/saturation/jitter) | `src/photometry/smearing.ts`, `src/photometry/instrumentNoise.ts`               |
| Observables (RV + astrometry)       | Implemented                  | `StepResult.meta.observables` incl. timing/conservation              | `src/sim/observables.ts`, `src/sim/stateSampler.ts`, `src/core/typesResults.ts` |

## Documentation map

- Physics overview: `docs/physics/overview.md`
- Full derivation (implemented + ideal): `docs/physics/full-derivation.md`
- Orbits and Kepler elements: `docs/physics/orbits.md`
- N-body dynamics: `docs/physics/nbody.md`
- Relativity and timing: `docs/physics/relativity.md`
- Photometry model: `docs/physics/photometry.md`
- Parameter units: `docs/params.md`
- How to add a planet or moon: `docs/ADDING_BODY.md`

## Interactive presets (UI)

The UI includes a **Preset** dropdown (see `src/app/presets.ts`) with short, didactic scenarios:

- Kepler: planet-only transit (clean transit geometry)
- Limb darkening: multi-band variation (ingress/egress curvature)
- N-body: perturber + star reflex (dynamic timing/velocity effects)

The UI also emits stability warnings (Hill/Roche/dtMax heuristics) when configurations are likely
non-physical or numerically risky.

## How to teach with this (didactic use-case)

Suggested lesson flow (each step corresponds to a UI preset + a small parameter sweep):

1. **Geometry-first (planet-only transit)**
   - Sweep `planetInc` to move from central to grazing transits.
   - Change `planetR` to see the depth scaling ~ (Rp/Rs)\u00b2 (uniform disk approximation).
2. **Ingress/egress physics (limb darkening)**
   - Compare different `ldBandpass` coefficients to see how the curvature changes.
3. **Dynamics (N-body with perturber)**
   - Enable the perturber and compare timing/shape diagnostics over multiple orbits.

Model/parameter reference:

- UI \u2194 model mapping and units: `docs/params.md`
- Physics overview and file anchors: `docs/physics/overview.md`

## Scripts

All scripts are `pnpm`-first:

- `pnpm dev` / `pnpm start`: Vite dev server
- `pnpm build`: production build
- `pnpm preview`: preview build
- `pnpm typecheck`: TypeScript (incl. tests)
- `pnpm test`: Vitest (unit + smoke)
- `pnpm lint`: ESLint + Prettier check
- `pnpm format`: Prettier write
- `pnpm ci:verify`: lint + typecheck + test + build (CI gate)
- `pnpm audit:security`: high-severity production dependency audit
- `pnpm audit:full`: security + depcheck + dead-code audit

## Configuration

Configuration is driven by `SystemParams` and the UI fields in `index.html`.
See `docs/params.md` for UI-to-model mapping and units.

When N-body is enabled, choose `dtMax` so the shortest orbit has at least ~50 steps per period.
The UI emits a warning when `dtMax` is coarser, but stability remains heuristic.

## Development

- `pnpm dev` for a local dev server.
- `pnpm ci:verify` for a full local verification.

## Testing

- `pnpm test` for unit/smoke tests.
- `pnpm typecheck` for TypeScript checks (includes tests).

## Runbook

See `docs/RUNBOOK.md` for setup, fast/full loops, security checks, and troubleshooting.

## Project structure

```
src/
├── app/           # Scenario presets, debug, noise helpers
├── config/        # Default scenario config
├── core/          # Types, units, DOM helpers
├── photometry/    # Transit, limb darkening, phase curves, variability
├── physics/       # Vectors, frames, kepler, relativity, barycenter
├── render/        # Canvas rendering and overlays
├── sim/           # Kinematics, dynamics, pipeline orchestration
├── ui/            # UI references, inputs, enable/disable logic
├── main.ts        # App wiring and render loop
└── style.css
```

## Simulation pipeline (high level)

1. Read and validate parameters.
2. Compute kinematics (Kepler or N-body).
3. Build occulters (planet, moon, rings, oblate shapes).
4. Compute transit attenuation (multiplicative).
5. Compute additive flux (phase curves, variability, scattering).
6. Combine flux and return diagnostics.

Contract:

- $F_{\mathrm{total}} = (F_{\star} + F_{\mathrm{stellarVar}})\,F_{\mathrm{transit}} + F_{\mathrm{planet}} + F_{\mathrm{moon}} + F_{\mathrm{scatter}}$

## Scientific model overview (concise)

Coordinates and projection:

- Orbits are defined by Kepler elements (a, e, inc, $\Omega$, $\omega$, period, $t_0$).
- Positions are converted from perifocal (PQW) to inertial and projected to the
  observer sky plane.
- A body can occult the star if $\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}} > 0$.

Flux conventions:

- Transit attenuation is multiplicative and nominally in [0, 1].
- Additive components are expressed in stellar flux units.

Kepler solver:

- Mean anomaly: $M = n(t - t_0)$, with $n = 2\pi/\mathrm{period}$.
- Solve $M = E - e\sin E$, then compute $\nu$ and $r$ from $E$.

N-body:

- Velocity-Verlet integration for star, planet, moon, and perturbers.
- Orbit elements are used only as initial conditions.

Relativity:

- Light-time delay (Roemer-like) uses $(\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}})/c$.
- Shapiro delay uses a point-mass log term.
- GR precession is derived from a, e, and mu in Kepler mode; a 1PN
  star-centric correction is applied in N-body mode.

## Usage

Core API:

- `stepSystem(params: SystemParams, tSec: number): StepResult`

The result includes:

- `fluxTotal`, `fluxTransitFactor`, additive flux components
- `planetSky`, optional `moonSky`
- diagnostics in `meta` (impact parameters, TDV ratio, etc)

Finite exposure smearing:

- Configure `cadenceSec` and `nSubsamples` under `star.photometry`.
- Geometry is evaluated at the center time; flux can be averaged.

## Units and normalization

- Length: meters (SI).
- Time: seconds (SI).
- Angle: radians in the model (UI uses degrees).
- Gravitational parameter: $\mu = GM$ in m^3/s^2.

Note: Defaults/presets are now in SI units. If you have older configs using non‑SI “sim units,” convert them.

Notes:

- If `planet.m` and `moon.m` are provided, `planet.orbit` is interpreted as the
  planet-moon barycenter orbit.
- N-body requires static orbit elements (initial conditions).

## Reproducibility

Use the same random seed to make measurement noise deterministic. Reset actions
explicitly reset the noise state to avoid frozen correlations after time jumps.

## Known limitations (short)

- Shapiro delay is a point-mass approximation (star at origin).
- N-body GR correction is star-centric and approximate.
- Mutual events are modeled with uniform disks (crescent overlap not modeled).

## License

MIT License. See `LICENSE`.

## Security

See `SECURITY.md` for vulnerability reporting.

## Troubleshooting

See `docs/RUNBOOK.md` for common troubleshooting steps.

## Contributing

See `CONTRIBUTING.md`.
