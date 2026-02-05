# Physics Overview

This simulator uses SI units internally:

- Length: meters (m).
- Time: seconds (s).
- Angles: radians in the model (UI uses degrees and converts).
- Gravitational parameter: $\mu = GM$ in m^3/s^2.

## What is simulated (short)

At each time `t` the simulator computes:

1. 3D inertial positions (Kepler or N-body) and a sky-plane projection.
2. A **multiplicative** stellar transit attenuation factor $F_{\mathrm{transit}}(t) \in [0,1]$.
3. Optional **additive** flux terms (phase curves, variability, forward scattering, …).

The main entry point is `stepSystem(params, tSec)` in `src/sim/sim.ts`.

Coordinate system and projection:

- Orbits are defined in a 3D inertial frame using Kepler elements.
- Observer direction $\mathbf{n}_{\mathrm{obs}}$ points from the star toward the observer.
- A body is "in front" of the star if $\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}} > 0$.
- Sky-plane projection uses the basis in `src/physics/frames.ts`.

## Didactic use-cases (UI presets)

Use the **Preset** dropdown in the UI (implemented in `src/app/presets.ts`) as a guided path:

1. **Kepler: planet-only transit**
   - Demonstrates the geometry of transits (impact parameter, ingress/egress).
   - Recommended knobs: `planetInc`, `planetR`, `observerZ`, `gridRes`, limb darkening (`ldU1/ldU2`).
2. **Limb darkening: multi-band variation**
   - Demonstrates how stronger LD changes ingress/egress curvature and depth normalization.
   - Use `ldBandpass` to switch `bands` (multi-band coefficients).
3. **N-body: perturber + star reflex**
   - Demonstrates how coupled dynamics can produce timing/velocity changes (TTV/TDV-style diagnostics).
   - Recommended knobs: `nbodyDtMax`, perturber orbit/mu, and the plot mode (physical vs measured).

For a complete mapping of UI fields to model paths and units, see `docs/params.md`.

Key files:

- Orbits and elements: `src/physics/kepler.ts`, `src/sim/orbits.ts`
- Kinematics and projection: `src/sim/kinematics.ts`
- N-body dynamics: `src/sim/dynamics.ts`
- Relativity and timing: `src/physics/relativity.ts`
- Photometry: `src/sim/transitFlux.ts`, `src/photometry/*`
