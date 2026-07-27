# Relativity and Timing Corrections

Light-time (Roemer-like) one-way travel time:

- $\Delta t_{\mathrm{Roemer}} = -\frac{\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}}}{c}$ (relative path-length delay for an observer at infinity in direction $\mathbf{n}_{\mathrm{obs}}$)
- r is the body position relative to the star (sky origin). Retarded time: $t_{\mathrm{emit}} = t_{\mathrm{obs}} - \Delta t$.

Shapiro delay (point-mass, star at origin):

- $\Delta t_{\mathrm{Shapiro}} = -\frac{2\mu}{c^3}\,\ln\!\left(\frac{r + z}{r}\right)$
  where $z = \mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}}$ and $r = \lVert \mathbf{r} \rVert$.
- This is a differential delay with an arbitrary additive reference; it grows
  toward superior conjunction. A minimum transverse impact parameter can be
  used to regularize the point-mass singularity.

GR apsidal precession (weak-field, two-body):

- $\Delta\omega = \frac{6\pi\mu}{a(1 - e^2)c^2}$ per orbit

Behavior in this codebase:

- Compatibility Kepler mode: precession is derived from (a, e, period, c) unless a non-zero
  per-orbit override is provided.
- Compatibility N-body mode: a star-centric 1PN correction is applied; per-orbit overrides
  are ignored.
- Compatibility enhanced timing mode (`dynamics.relativityLevel="enhanced"`):
  approximate multi-body Shapiro aggregation is available for observables/timing diagnostics.
- V4 browser runtime: relativity is unavailable. A valid enabled request fails
  with `SCB_RELATIVITY_UNAVAILABLE`; V4 never silently reports a relativity
  result. `scientific-browser` remains a strict educational validation profile.
- V5 backend: relativity is not implemented in the current local backend and
  is excluded from its manifest validity domain.
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
  evidence plus static LTTE+Shapiro same-model regressions.
  The literature benchmark lane now also checks the canonical approximately 499 second
  one-AU light-time reference directly, so LTTE has a named astronomy-style target
  instead of only synthetic parameter sweeps.
  The literature benchmark lane now also checks the solar-limb one-AU relative
  Shapiro convention at approximately 113 microseconds. This preserves the
  helper's arbitrary-zero relative-delay behavior; it is not an independent
  absolute observable or a calibrated radar-delay model.
  That same benchmark lane now also checks a five-AU solar-limb relative Shapiro
  regression at approximately 144 microseconds. The static enhanced multi-body
  branch is compared with a direct sum of the same production point-mass helper.
  These checks prevent accidental implementation drift but are explicitly not
  independent scientific release evidence.
  The literature benchmark lane now also checks Mercury-like weak-field GR
  apsidal precession against the canonical approximately 43 arcsec/century reference band.
  The constant-velocity LTTE case and Mercury target remain the independent
  evidence in this compatibility lane; the Shapiro evidence gap stays open.

Learner-visible timing surface:

- The interactive shell can expose timing-oriented markers and overlays, but
  V4 does not run the shared LTTE/Shapiro solver. These are preview diagnostics,
  not evidence of an active relativistic propagation correction.
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
