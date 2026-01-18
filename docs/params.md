# Parameters and Units

Core units:

- Length: simulation units (consistent across star/planet/moon radii and orbits).
- Time: seconds.
- Angle: radians in model (UI uses degrees).
- Gravitational parameter: mu = G*M in (L^3 / T^2).

Key parameter groups:

- `SystemParams.star`: radius and photometry settings.
- `SystemParams.planet`: radius, optional mass, orbit elements.
- `SystemParams.moon`: radius, optional mass, orbit elements around planet.
- `SystemParams.dynamics`: N-body/relativity options.

Notes:

- If both `planet.m` and `moon.m` are present, the planet orbit is treated
  as the barycenter orbit.
- N-body uses the orbit elements only as initial conditions.
