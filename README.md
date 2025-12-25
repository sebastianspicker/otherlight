# Exoplanet–Exomoon Transit Simulation

Interactive, time-based **2D** sky-plane visualization of a star–planet–moon system with synthetic transit photometry (normalized light curves) and optional astrophysical “out-of-transit” flux components (phase curve, stellar variability) plus finite-exposure smearing. 

The simulation is *kinematic* (Keplerian elements, not N-body integration) and uses a deterministic `stepSystem(params, tSec)` core that returns both geometry (projected positions) and flux diagnostics for rendering and plotting. 



## Scientific model overview

### Coordinates and projection

- Orbits are defined by classical Keplerian elements $\(a, e, i, \Omega, \omega, P, t_0\)$ and converted from perifocal (PQW) into an inertial frame, then projected into the observer’s sky plane. 
- Observer direction `params.observer.dir` points from the star toward the observer; a body is considered “in front” (able to occult the star) when $\(r \cdot \hat{n}_\mathrm{obs} > 0\)$. 
- The sky-projection returns $\((x, y)\)$ coordinates and a depth `z` along the observer direction; larger `z` means closer to the observer. 

### Flux conventions

- The core photometry returns a *multiplicative* stellar transit attenuation $\(F_\mathrm{transit}(t)\)$ in approximately $\([0,1]\)$. 
- Additive components are expressed in “stellar flux units” and applied as:  
  $\(F_\mathrm{total}(t) = \left(F_0 + f_\mathrm{planet}(t) + f_\mathrm{moon}(t) + f_\mathrm{var}(t)\right)\,F_\mathrm{transit}(t)\)$, where `baselineFlux` defaults to 1.0 when not provided. 

### Transit photometry models

Depending on `params.star.photometry`, the code selects among:
- Uniform stellar disk (no patches): analytic for a single occulter, and robust numeric union integration for multi-body overlaps. 
- Uniform disk + brightness patches (“spots/faculae”): numeric midpoint integration (always). 
- Limb darkening:
  - Legacy quadratic coefficients (`limbDarkening.u1/u2`) use a dedicated numerical limb-darkened integrator. 
  - Optional multi-law / multi-band limb darkening via `limbDarkeningModel` may be supported if the corresponding optional modules exist in the repo. 

### Finite exposure (smearing)

Finite exposure time is implemented outside the core stepper as a boxcar average centered at time `t` using:
- `cadenceSec`: exposure duration in seconds,
- `nSubsamples`: number of subsamples to approximate the integral. 

The geometry rendering stays at the *center time* while the plotted flux can be the smeared average (stable visuals + physically meaningful integration). 

### Planet–moon barycentric wobble (TTV/TDV)

If both `planet.m` and `moon.m` are provided (>0), `planet.orbit` is interpreted as the barycenter orbit and the instantaneous planet/moon positions are split around the barycenter accordingly. 

This affects both the projected sky positions and the photometric signal (transit shape and timing). 

### Mutual events and secondary eclipse (minimal)

- Mutual events: when one body occults another, the occulted body’s *additive* flux is reduced by the visible disk fraction (z-order aware). 
- Minimal secondary eclipse gating: if a body is behind the star (`sky.z < 0`) and its projected center lies inside the stellar disk, its additive flux term is set to 0 for that timestep. 



## Key features

### Simulation and determinism

- The UI loop advances simulation time in seconds with a clamped real-time delta to avoid frame spikes after tab switching. 
- Rendering cadence is `requestAnimationFrame`, but the physics is time-based so motion is largely frame-rate independent (up to dt clamping). 

### Photometry and diagnostics

- Additive components currently supported by the simulation core include:
  - Planet phase curve (`phaseCurve`) and optional moon phase curve (`moonPhaseCurve`) parameters. 
  - Stellar variability (`stellarVariability`) with beaming/ellipsoidal toy terms. 
- Diagnostics are returned via `StepResult.meta`, including (when available) `nOcculters`, `planetVisibleFraction`, `moonVisibleFraction`, and (optionally) timing/shape metrics like sky-plane speed and TDV ratio. 

### Measurement layer (optional)

- The default plot shows a physically computed flux (typically smeared, if configured). 
- A measurement/noise layer can be integrated as an additional optional step in `main.ts` (instrument noise/systematics), and a UI mode switch can select plotting “physical vs measured”. 



## Project structure (current)

The codebase is split into domain modules. The paths below reflect the current repo naming conventions visible in `main.ts` and the core type file. 

> Note: Some modules have historically existed both as “flat” filenames (e.g. `coretypes`) and in folders (e.g. `core/types`). Keep import paths consistent across the repo to avoid duplicated modules and runtime bundler errors. 

Example layout (conceptual; adjust if your repo uses folder-based paths everywhere):

```
src/
├── core/
│   ├── types.ts
│   └── units.ts
├── physics/
│   ├── vec3.ts
│   ├── kepler.ts
│   ├── frames.ts
│   ├── barycenter.ts
│   └── exomoonTiming.ts
├── photometry/
│   ├── transitUniform.ts
│   ├── transitUniformSpots.ts
│   ├── transitQuadraticLD.ts
│   ├── mutualEvents.ts
│   ├── phaseCurve.ts
│   ├── stellarVariability.ts
│   └── smearing.ts
├── sim/
│   └── sim.ts
├── render/
│   └── canvas2d.ts
├── main.ts
└── style.css
```



## Getting started

### Prerequisites
- Node.js (16+ recommended)
- npm

### Install
```
npm install
```

### Run dev server
```
npm run dev
```

Open `http://localhost:5173` in your browser.



## Usage

### Core API: `stepSystem`

The simulation core is a synchronous function:

- `stepSystem(params: SystemParams, tSec: number): StepResult` 

`StepResult` includes:
- `flux`: primary flux used by plot/render pipeline, 
- `planetSky`, optional `moonSky`: projected positions in sky plane, 
- optional decomposition fields (`fluxTransitOnly`, `fluxPhaseOnly`, `fluxTotal`) and `meta` diagnostics. 

### Finite exposure smearing

In `main.ts`, the light curve can be boxcar-averaged using:

- `cadenceSec` and `nSubsamples` under `params.star.photometry`. 

The recommended approach (already supported) is:
- compute geometry once at center time `t` for stable visuals,
- compute flux by averaging sub-samples around `t` for physical realism. 



## Scientific details

### Kepler solver and anomalies

At time `t`, mean anomaly is computed from the period and reference epoch, then Kepler’s equation is solved for eccentric anomaly \(E\), and true anomaly \(\nu\) and radius \(r\) are derived to locate the body in its orbital plane. 

This implementation is designed to be robust across typical eccentricities, but interactive UI presets clamp eccentricity to keep the visualization stable and avoid pathological near-parabolic cases. 

### Transit flux computation

The transit model computes the fraction of the stellar disk obscured by projected circular occulters and returns a normalized attenuation factor (approximately in \([0,1]\)). 

For multiple occulters, the code uses a deterministic method that avoids double-counting overlap regions (union-of-disks integration). 



## Configuration notes

### Units and normalization

- Lengths are in arbitrary but internally consistent simulation units. 
- Time is seconds. 
- Angles are radians in the model; UI inputs may be in degrees and converted in `main.ts`. 
- Photometric flux is normalized so that baseline is typically 1.0 (`baselineFlux`), with additional components expressed in stellar units and applied multiplicatively with the transit attenuation. 

### Optional modules

Some features are designed to be optional and may be guarded in code (e.g., multi-law limb darkening or instrument noise). 

If you add optional modules, ensure:
- the exports match the import style (named vs default), and
- the UI mode switch “physical vs measured” is wired so the plotted series corresponds to the selected layer. 



## Roadmap (science + engineering)

- Limb darkening: extend and validate multi-law / multi-band usage via `limbDarkeningModel.constraints` checks (non-negative intensity, monotonicity policies). 
- Measurement layer: add optional instrument noise/systematics module and expose it in the UI with a “Plot physical vs measured” selector. 
- UI wiring: connect additional parameter panels (patches, limb darkening, phase curves, smearing, variability, exomoon timing/shape) to `SystemParams` while preserving backward compatibility. 
- Stability heuristics: show warnings for potentially unstable moon configurations (e.g., large semi-major axis relative to a Hill-like scale when masses are provided). 



## License

MIT License. See `LICENSE`.
