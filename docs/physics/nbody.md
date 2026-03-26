# N-body Dynamics

The N-body mode integrates star, planet, moon, and optional perturbers using
velocity-Verlet (kick-drift-kick):

- $\mathbf{r}_1 = \mathbf{r}_0 + \mathbf{v}_0\,dt + \tfrac{1}{2}\,\mathbf{a}_0\,dt^2$
- $\mathbf{v}_1 = \mathbf{v}_0 + \tfrac{1}{2}(\mathbf{a}_0 + \mathbf{a}_1)\,dt$

Newtonian acceleration for body i due to body j:

- $\mathbf{a}_i \mathrel{+}= \mu_j\,\frac{\mathbf{r}_j - \mathbf{r}_i}{\lVert \mathbf{r}_j - \mathbf{r}_i \rVert^3}$

Softening:

- Optional Plummer softening eps:
  $\lVert \mathbf{r} \rVert^3 \to (\lVert \mathbf{r} \rVert^2 + \varepsilon^2)^{3/2}$

Initial conditions:

- The planet orbit defines the barycenter of planet+moon around the star.
- The moon orbit defines the moon relative to the planet.
- The full system is shifted to the barycenter of all bodies to remove drift.

GR correction (approximate):

- A 1PN Schwarzschild correction is applied for bodies relative to the star.
- This is a star-centric approximation (valid when muStar dominates).

Related code:

- `src/sim/dynamics.ts`
- `src/sim/nbody/*`
