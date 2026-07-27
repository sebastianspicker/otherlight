# Adding a Planet or Moon

This simulator uses SI units internally (meters, kilograms, seconds). The UI exposes some angles in degrees, but the model always stores radians.

## Add or update a planet

Edit the default scenario (or create a new preset based on it):

1. Update the planet body:
   - `planet.r` (meters)
   - `planet.m` (kg, optional but needed for Hill/Roche and N-body)
2. Update the planet orbit (Kepler mode):
   - `planet.orbit.a` (meters)
   - `planet.orbit.e` (0..1)
   - `planet.orbit.inc` (radians)
   - `planet.orbit.Omega`, `planet.orbit.omega` (radians)
   - `planet.orbit.period` (seconds)
   - `planet.orbit.t0` (seconds)

Files to edit:

- `src/config/scenario.default.json` (defaults and UI ranges)
- `src/app/presets.ts` (optional: add a didactic preset)

If you adjust UI ranges, keep clamps in `src/ui/params/common.ts`, `src/ui/params/read.ts`, and `src/ui/params/nbody.ts` consistent with the new scale.

## Add or update a moon

1. Enable and size the moon:
   - `moon.r` (meters)
   - `moon.m` (kg, optional but needed for Hill/Roche and N-body)
2. Set the moon's orbit around the planet:
   - `moon.orbitAroundPlanet.a` (meters)
   - `moon.orbitAroundPlanet.e` (0..1)
   - `moon.orbitAroundPlanet.inc` (radians)
   - `moon.orbitAroundPlanet.Omega`, `moon.orbitAroundPlanet.omega` (radians)
   - `moon.orbitAroundPlanet.period` (seconds)
   - `moon.orbitAroundPlanet.t0` (seconds)

Files to edit:

- `src/config/scenario.default.json` (defaults and UI ranges)
- `src/app/presets.ts` (optional: add a didactic preset)

Notes:

- Hill/Roche warnings require both masses.
- The compatibility kernel can use N-body when
  `dynamics.nbodyPlanetMoon.enabled = true` and its mass parameters are set.
  The V4 browser runtime rejects this toggle because it does not execute the
  integrator. Research propagation uses the separate V5 Cartesian-state contract.

## Verification (recommended)

After edits:

```bash
pnpm lint
pnpm test
```
