# Orbits and Kepler Elements

The simulator uses standard Keplerian elements:

- a: semi-major axis
- e: eccentricity
- inc: inclination
- $\Omega$: longitude of ascending node
- $\omega$: argument of periapsis
- period: orbital period
- t0: reference epoch for mean anomaly

Mean motion:

- $n = 2\pi/\mathrm{period}$
- $M(t) = n(t - t_0)$

Kepler's equation (elliptic):

- $M = E - e\sin E$

True anomaly and radius:

- $\nu = \operatorname{atan2}\!\left(\sqrt{1 - e^2}\,\sin E,\ \cos E - e\right)$
- $r = a(1 - e\cos E)$

Position in the orbital plane (PQW frame):

- $\mathbf{r}_{\mathrm{PQW}} = (r\cos\nu,\ r\sin\nu,\ 0)$

Rotation to inertial coordinates:

- Apply $\Omega$, inc, $\omega$ rotations (see `src/physics/frames.ts`).

Runtime note:

- These Kepler elements drive both the default interactive browser runtime and the stricter `scientific-browser` validation/runtime path.
- The difference is not the orbital parametrization itself but the surrounding runtime contract, diagnostics, and feature gating applied after the orbital state is built.

Related code:

- `src/physics/kepler.ts`
- `src/sim/orbits.ts`
