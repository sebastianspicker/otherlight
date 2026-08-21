# Validation and Warnings

> Execution-status correction: `scientific-browser` is a strict V4 input
> validation profile, not a scientific solver. V4 always executes Kepler
> snapshots and now rejects enabled N-body or relativity features. The legacy
> Historical browser calibration and performance suites are not release
> evidence. Authoritative classifications live in `docs/physics/model-registry.json`.

The browser and backend use four complementary validation layers:

## 1. Hard input validation (throws)

- Implemented in `src/sim/validation/assertions.ts` via `assertStepInputs()` and `assertOrbit()`.
- Enforces finite/positive radii, orbit basics, N-body prerequisites, and key photometry ranges.

## 2. Soft plausibility warnings (non-fatal)

- Implemented in `src/sim/validation/warnings.ts` via `collectParamWarnings()`.
- Implemented in `src/physics/hill.ts` via `validateSystemParamsPhysics()`.
- Returned warnings are shown in the UI as guidance for likely unphysical or numerically risky setups.

## 3. Shared numeric sanitization (fail-open)

- Implemented in `src/core/units.ts`.
- Helpers such as `clamp()`, `toFiniteNumber()`, `toFiniteNonNeg()`, and `toFinitePositiveOr()` coerce invalid values to safe bounds or fallbacks instead of throwing.
- This policy keeps the interactive simulator running, but it should be treated as an explicit contract, not invisible magic.

## 4. Solver fallback policy

- `src/physics/kepler.ts` throws only in `strict` mode.
- Non-`strict` callers receive a finite wrapped best-effort anomaly if Newton iteration exhausts its retry budget.
- Use `strict: true` in scientific or regression-sensitive paths that must fail closed.

## Execution validation boundaries

- Education V4 uses the hard assertions, plausibility warnings, bounded
  sanitization, and documented fallback behavior above. It is an interactive
  teaching preview.
- `scientific-browser` remains a strict V4 compatibility-validation profile.
  It rejects unsupported dynamics and selected inherited normalization paths,
  but it is not the user-facing Scientific solver and cannot produce a V5
  result.
- Scientific V5 in the browser uses the exact schema and capability checks
  in `src/science/validation.ts`. It converts only supported static SI states
  and fails closed when a capability, field, invariant, or backend response is
  missing or invalid.
- The Python backend independently validates the V5 request, bounded
  three-body/sample limits, barycentric state, finite-radius separation,
  solver output, cancellation, artifact publication, and provenance manifest.
  Stable HTTP failures use a structured `{code, message}` payload.

Excluded from the current alpha:

- full stellar-atmosphere or SED-grid synthesis
- full radiative-transfer atmosphere/transmission or emission modeling
- scientific support for all current additive toy photometry controls as if they were one validated physical surface
- remote-calibration, inference, or multi-user scientific workflows
- solver regimes whose cost cannot be benchmarked reproducibly inside the browser budget

## Common Warning Categories

- High eccentricity (`HIGH_ECC_PLANET`, `HIGH_ECC_MOON`)
- Periapsis inside body radius (`PLANET_PERIA_INSIDE_STAR`, `MOON_PERIA_INSIDE_PLANET`)
- Roche/Hill stability heuristics (`MOON_ROCHE_LIMIT`, `MOON_APO_OUTSIDE_HILL`, `MOON_BEYOND_HILL_STABILITY`)
- Coarse N-body timestep (`NBODY_DT_COARSE`)
- Configuration mismatches (`ATM_LAMBDA_TAUSCALE_MISMATCH`, `NBODY_GR_OVERRIDE_IGNORED`)

## Notes

- Warnings are heuristic by design and do not guarantee physical correctness.
- For reproducible analysis, keep units in SI (m, s, kg, rad) as documented in `docs/physics/overview.md`.
- A successful V5 result is evidence that the bounded request and execution
  contract passed. It is not independent research validation or validation of
  Education photometry.
- Detached-binary V4 configs may now carry explicit per-star stellar metadata (`luminosityScale`, `teffK`, `loggCgs`, `metallicityDex`, `passband`). The runtime preserves those fields and now benchmarks unequal-star/passband behaviour on the active Binary Lab path, but the detached-binary model remains an interactive relative-flux approximation rather than a research-grade atmosphere/passband solution.
- Atmosphere transmission currently applies only to circular occulters. Mixed-shape cases fall back to the non-transmissive solver and log a runtime warning.

| Entry ID                             | Reference anchor                                                                                                                                            | Tolerance                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `binary-photometry-analytic-overlap` | Independent uniform-disk eclipse-depth reference from exact circle-overlap area plus passband-resolved luminosity weights on the sampled benchmark geometry | analytic overlap comparison on selected primary and symmetric eclipse cases     |
| `atmosphere-rt-annulus-reference`    | Independent gray annulus-integration reference with `4096` radial samples around the effective circle-only atmosphere opacity helper                        | `max(5e-4, 3 percent of reference opacity)` on selected gray atmosphereRT cases |
| `additive-direct-model-reference`    | Direct photometry-model evaluation of `planetPhase`, `moonPhase`, `forwardScattering`, and `ringScattering` on sampled native snapshot geometry             | all covered additive channels close at 12 decimals                              |

Every `release evidence = yes` entry carries an explicit independent reference
anchor. The Shapiro and additive same-model entries retain anchors for
reproducibility while remaining `release evidence = no`.
