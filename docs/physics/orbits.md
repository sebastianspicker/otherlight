# Orbits and Kepler Elements

The simulator uses standard Keplerian elements:

- a: semi-major axis
- e: eccentricity
- inc: inclination
- Omega: longitude of ascending node
- omega: argument of periapsis
- period: orbital period
- t0: reference epoch for mean anomaly

Mean motion:

- n = 2*pi / period
- M(t) = n * (t - t0)

Kepler's equation (elliptic):

- M = E - e * sin(E)

True anomaly and radius:

- nu = atan2( sqrt(1 - e^2) * sin(E), cos(E) - e )
- r = a * (1 - e * cos(E))

Position in the orbital plane (PQW frame):

- r_pqw = (r * cos(nu), r * sin(nu), 0)

Rotation to inertial coordinates:

- Apply Omega, inc, omega rotations (see `src/physics/frames.ts`).

Related code:

- `src/physics/kepler.ts`
- `src/sim/orbits.ts`
