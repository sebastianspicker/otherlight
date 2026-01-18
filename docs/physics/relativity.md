# Relativity and Timing Corrections

Light-time (Roemer-like) delay:

- delta_t_roemer = (r · n_obs) / c
- r is the body position relative to the star (sky origin)

Shapiro delay (point-mass, star at origin):

- delta_t_shapiro = 2 * mu / c^3 * ln( (r + z) / r )
  where z = r · n_obs and r = |r|.
- A minimum impact parameter can be used to regularize the log.

GR apsidal precession (weak-field, two-body):

- delta_omega = 6*pi*mu / (a * (1 - e^2) * c^2) per orbit

Behavior in this codebase:

- Kepler mode: precession is derived from (a, e, period, c) unless a non-zero
  per-orbit override is provided.
- N-body mode: a star-centric 1PN correction is applied; per-orbit overrides
  are ignored.

Related code:

- `src/physics/relativity.ts`
- `src/sim/kinematics.ts`
- `src/sim/dynamics.ts`
