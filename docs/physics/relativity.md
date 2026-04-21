# Relativity and Timing Corrections

Light-time (Roemer-like) one-way travel time:

- $\Delta t_{\mathrm{Roemer}} = \frac{\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}}}{c}$ (travel time from body at r to observer at infinity)
- r is the body position relative to the star (sky origin). Retarded time: $t_{\mathrm{emit}} = t_{\mathrm{obs}} - \Delta t$.

Shapiro delay (point-mass, star at origin):

- $\Delta t_{\mathrm{Shapiro}} = \frac{2\mu}{c^3}\,\ln\!\left(\frac{r + z}{r}\right)$
  where $z = \mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}}$ and $r = \lVert \mathbf{r} \rVert$.
- A minimum impact parameter can be used to regularize the log.

GR apsidal precession (weak-field, two-body):

- $\Delta\omega = \frac{6\pi\mu}{a(1 - e^2)c^2}$ per orbit

Behavior in this codebase:

- Kepler mode: precession is derived from (a, e, period, c) unless a non-zero
  per-orbit override is provided.
- N-body mode: a star-centric 1PN correction is applied; per-orbit overrides
  are ignored.
- Enhanced timing mode (`dynamics.relativityLevel="enhanced"`):
  approximate multi-body Shapiro aggregation is available for observables/timing diagnostics.
- `scientific-browser` runtime contract:
  relativity no longer gets silent model/solver defaults once enabled.
  The V4 scientific-browser config now requires explicit
  `dynamics.relativityLevel`, `relativity.c`, `relativity.ltteIters`,
  `relativity.ltteTolSec`, and `relativity.shapiroMinImpact`
  when the corresponding timing features are enabled.
  The shared `src/physics/relativity.ts` helpers still keep interactive-safe defaults
  for the default educational path. That defaulting path is now treated as an
  educational-runtime concern, not an open blocker on the bounded `S3`
  scientific-browser contract.
- Shared solver metadata:
  `solveLightTimeCorrectedResult(...)` emits convergence/status metadata
  (`converged`, `iterations`, `maxIters`, `tolSec`, Shapiro usage mode, and
  the final Roemer/Shapiro/delay terms, plus a closure `residualSec`) alongside the retarded time.
  The shared Kepler path preserves that metadata into step diagnostics.
  The V4 native path does not yet run the same LTTE/Shapiro solve, so its
  relativity convergence diagnostics are currently reported as `unavailable`
  rather than implied `ok`.
- Shared validity-domain flags:
  the shared LTTE/Shapiro diagnostics now also emit explicit model-caveat flags.
  Current flags include:
  `implicit-ltte-iteration-budget` and `implicit-ltte-tolerance` when the shared
  educational solver still falls back to its built-in LTTE defaults,
  `weak-ltte-iteration-budget` when the shared solve is still running on the
  small interactive-budget iteration policy,
  `residual-exceeds-tolerance` when the returned retarded epoch fails its own
  LTTE closure tolerance check,
  `shapiro-impact-floor-engaged` when the configured Shapiro impact floor is
  actually engaged by the active geometry,
  `relative-shapiro-delay` for the non-calibrated differential Shapiro model,
  `single-point-mass-shapiro` for the toy point-mass branch,
  `weak-field-multi-body-shapiro-sum` for the enhanced summed point-mass branch,
  `unregularized-shapiro-impact` when no positive impact-parameter floor is applied,
  and `solver-not-run-native-path` when the V4 native runtime exposes relativity
  diagnostics without actually running the shared LTTE/Shapiro solver.

- Shared reference checks:
  the shared relativity test suite now includes closed-form constant-velocity LTTE
  and static LTTE+Shapiro reference cases so the solver is not only policy-labeled
  but also checked against bounded analytic expectations.
  The literature benchmark lane now also checks the canonical approximately 499 second
  one-AU light-time reference directly, so LTTE has a named astronomy-style target
  instead of only synthetic parameter sweeps.
  The literature benchmark lane now also checks the solar-limb one-AU relative
  Shapiro scale at approximately 113 microseconds, which matches the current
  helper's documented relative-delay contract rather than a full calibrated radar-delay model.
  That same benchmark lane now also checks a five-AU solar-limb relative Shapiro
  target at approximately 144 microseconds, so the bounded Shapiro evidence is a
  small distance-scaled reference family rather than only one named point.
  The benchmark lane also now checks the static enhanced multi-body branch against
  the direct summed point-mass analytic reference, so the repo-native Shapiro
  evidence covers both the single-mass and bounded summed-mass timing surfaces.
  The literature benchmark lane now also checks Mercury-like weak-field GR
  apsidal precession against the canonical approximately 43 arcsec/century reference band.
  That same benchmark lane now also carries the bounded constant-velocity LTTE
  and static LTTE+Shapiro reference cases, so all three primary relativity surfaces
  have a repo-native benchmark presence instead of living only in unit tests.

Learner-visible timing surface:

- The active interactive shell exposes relativity/timing consequences through timing markers, O-C history, epoch ghosts, and compare overlays rather than by showing the shared solver internals directly.
- That distinction matters:
  - the shared solver metadata is the authoritative place for convergence/status labeling
  - the native V4 browser path may still show timing-oriented visuals while reporting solver convergence as `unavailable`
- For the rendering/data contract that turns timing diagnostics into curve and canvas overlays, see `docs/rendering/physics-visualization-contract.md`.

Related code:

- `src/physics/relativity.ts`
- `src/sim/kinematics.ts`
- `src/sim/dynamics.ts`
- `src/sim/v4/nativeEngine.ts`
- `src/app/frameLoopVisualization.ts`
