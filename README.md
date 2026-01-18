# Exoplanet-Exomoon Transit Simulation

Interactive, time-based 2D sky-plane visualization of a star-planet-moon system
with synthetic transit photometry, phase curves, stellar variability, and
instrument-style measurement effects. The core is a deterministic stepper
`stepSystem(params, tSec)` that returns geometry and flux diagnostics for
rendering and plotting.

This repo supports both:

- Kinematic (Kepler) motion with barycentric splitting, and
- N-body dynamics with star reflex motion and optional perturbers.


## Quick start

Prerequisites:

- Node.js 18+ (recommended)
- npm

Install:

```
npm install
```

Run dev server:

```
npm run dev
```

Open `http://localhost:5173` in your browser.


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


## Documentation map

- Physics overview: `docs/physics/overview.md`
- Orbits and Kepler elements: `docs/physics/orbits.md`
- N-body dynamics: `docs/physics/nbody.md`
- Relativity and timing: `docs/physics/relativity.md`
- Photometry model: `docs/physics/photometry.md`
- Parameter units: `docs/params.md`
- Validation and warnings: `docs/validation.md`


## Project structure

```
src/
├── app/           # Scenario presets, debug, noise helpers
├── config/        # Default scenario config
├── core/          # Types, units, DOM helpers
├── experimental/  # Optional/experimental physics and photometry
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

- `F_total = (F_star + F_stellarVar) * F_transit + F_planet + F_moon + F_scatter`


## Scientific model overview (concise)

Coordinates and projection:

- Orbits are defined by Kepler elements (a, e, inc, Omega, omega, period, t0).
- Positions are converted from perifocal (PQW) to inertial and projected to the
  observer sky plane.
- A body can occult the star if r · n_obs > 0.

Flux conventions:

- Transit attenuation is multiplicative and nominally in [0, 1].
- Additive components are expressed in stellar flux units.

Kepler solver:

- Mean anomaly M = n * (t - t0), n = 2*pi/period.
- Solve M = E - e*sin(E), then nu and r from E.

N-body:

- Velocity-Verlet integration for star, planet, moon, and perturbers.
- Orbit elements are used only as initial conditions.

Relativity:

- Light-time delay (Roemer-like) uses r · n_obs / c.
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

- Length: simulation units (consistent across all bodies and orbits).
- Time: seconds.
- Angle: radians in the model (UI uses degrees).
- Gravitational parameter: mu = G*M in L^3 / T^2.

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
