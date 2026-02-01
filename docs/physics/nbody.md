# N-body Dynamics

The N-body mode integrates star, planet, moon, and optional perturbers using
velocity-Verlet (kick-drift-kick):

- r1 = r0 + v0 _ dt + 0.5 _ a0 \* dt^2
- v1 = v0 + 0.5 _ (a0 + a1) _ dt

Newtonian acceleration for body i due to body j:

- a_i += mu_j \* (r_j - r_i) / |r_j - r_i|^3

Softening:

- Optional Plummer softening eps:
  |r|^3 -> (|r|^2 + eps^2)^(3/2)

Initial conditions:

- The planet orbit defines the barycenter of planet+moon around the star.
- The moon orbit defines the moon relative to the planet.
- The full system is shifted to the barycenter of all bodies to remove drift.

GR correction (approximate):

- A 1PN Schwarzschild correction is applied for bodies relative to the star.
- This is a star-centric approximation (valid when muStar dominates).

Related code:

- `src/sim/dynamics.ts`
- `src/experimental/physics/nbody.ts`
