# N-body Dynamics: Compatibility and V5 Contracts

The compatibility kernel can integrate star, planet, moon, and optional
perturbers using velocity-Verlet. The shipped V4 browser runtime does not
call this integrator: V4 constructs Kepler snapshots and rejects an enabled
N-body request. Therefore the equations below describe `stepSystem` and focused
tests, not `createSimulationV4`.

The compatibility velocity-Verlet update is:

- $\mathbf{r}_1 = \mathbf{r}_0 + \mathbf{v}_0\,dt + \tfrac{1}{2}\,\mathbf{a}_0\,dt^2$
- $\mathbf{v}_1 = \mathbf{v}_0 + \tfrac{1}{2}(\mathbf{a}_0 + \mathbf{a}_1)\,dt$

Newtonian acceleration for body i due to body j:

- $\mathbf{a}_i \mathrel{+}= \mu_j\,\frac{\mathbf{r}_j - \mathbf{r}_i}{\lVert \mathbf{r}_j - \mathbf{r}_i \rVert^3}$

Softening:

- Optional Plummer softening eps:
  $\lVert \mathbf{r} \rVert^3 \to (\lVert \mathbf{r} \rVert^2 + \varepsilon^2)^{3/2}$
- The matching diagnostic potential is
  $U_{ij}=-Gm_im_j/\sqrt{r_{ij}^2+\varepsilon^2}$.

Initial conditions:

- The planet orbit defines the barycenter of planet+moon around the star.
- The moon orbit defines the moon relative to the planet.
- The full system is shifted to the barycenter of all bodies to remove drift.

GR correction (approximate):

- A 1PN Schwarzschild correction is applied for bodies relative to the star.
- This is a star-centric approximation (valid when muStar dominates).
- Reported energy is the Newtonian (or Plummer-softened Newtonian) diagnostic;
  it does not include a 1PN conserved-energy correction when GR is enabled.

Preview diagnostics:

- The V4 UI may render timing, O-C, barycentre, drift, and comparison cues, but
  those visuals are not evidence that N-body propagation ran.
- The rendering/data contract for those overlays is documented in `docs/rendering/physics-visualization-contract.md`.

The local V5 backend instead accepts barycentric Cartesian SI states at an
explicit epoch and uses SciPy DOP853 with declared relative and absolute
tolerances. Its gravitational force is unsoftened Newtonian point-mass gravity.
Positive body radii are required for initial non-overlap validation and
finite-radius contact rejection during propagation. Impact and merger outcomes
are not modeled. Sample times are internally ordered for integration and
restored to request order. That first backend slice excludes relativity, tides,
collision outcomes, and rotational multipoles.

Related code:

- `src/sim/dynamics.ts`
- `src/sim/nbody/*`
- `science_backend/science_backend/forward.py`
- `src/app/frameLoopVisualization.ts`
