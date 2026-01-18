# Physics Overview

This simulator uses internally consistent simulation units:

- Length: arbitrary but consistent (star/planet radii, semi-major axes, etc).
- Time: seconds.
- Angles: radians in the model (UI uses degrees and converts).
- Gravitational parameter: mu = G*M in (L^3 / T^2).

Coordinate system and projection:

- Orbits are defined in a 3D inertial frame using Kepler elements.
- Observer direction n_obs points from the star toward the observer.
- A body is "in front" of the star if r · n_obs > 0.
- Sky-plane projection uses the basis in `src/physics/frames.ts`.

Key files:

- Orbits and elements: `src/physics/kepler.ts`, `src/sim/orbits.ts`
- Kinematics and projection: `src/sim/kinematics.ts`
- N-body dynamics: `src/sim/dynamics.ts`
- Relativity and timing: `src/physics/relativity.ts`
- Photometry: `src/sim/transitFlux.ts`, `src/photometry/*`
