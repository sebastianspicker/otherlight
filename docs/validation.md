# Validation and Warnings

> Execution-status correction: `scientific-browser` is a strict V4 input
> validation profile, not a scientific solver. V4 always executes Kepler
> snapshots and now rejects enabled N-body or relativity features. The legacy
> `scientific-calibration` script name denotes compatibility regression
> evidence; its internal/direct-model fixtures do not promote a model to
> research-validated status. Authoritative classifications live in
> `docs/physics/model-registry.json`.

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

## Compatibility calibration catalog

The V4 compatibility and regression surfaces have an explicit calibration
catalog in:

- `tests/benchmarks/scientific-calibration-catalog.ts`

Current compatibility calibration surfaces:

- `relativity-timing`
- `detached-binary-photometry`
- `bounded-atmosphere-rt`
- `additive-photometry`
- `exact-event-timing`

The catalog records, for each active surface:

- the claimed scientific behavior
- the reference kind
- provenance for the reference or budget
- the tolerance contract
- the owning regression file
- whether the entry counts as release evidence or only as a local feasibility budget

The named local regression lane for that catalog is:

- `pnpm scientific-calibration`

That lane currently bundles:

- `tests/benchmarks/literature-benchmarks.test.ts`
- `tests/sim/transit-timing-tracker.test.ts`
- `tests/sim/v4-native-parity.test.ts`
- `tests/perf/perf-scenarios.test.ts`

This is a compatibility-kernel calibration catalog, not evidence that V4 is a
scientific runtime. Some entries compare canonical targets, independent
analytic/geometry implementations, or higher-resolution numeric references.
Entries that call the same production formula are explicitly
`direct-model-reference` regressions and do not count as release evidence.

Current catalog entries:

| Surface                      | Entry ID                             | Reference kind                      | Release evidence | Owner                                            |
| ---------------------------- | ------------------------------------ | ----------------------------------- | ---------------- | ------------------------------------------------ |
| `relativity-timing`          | `relativity-mercury-precession`      | `canonical-astronomy-target`        | yes              | `tests/benchmarks/literature-benchmarks.test.ts` |
| `relativity-timing`          | `relativity-ltte-constant-velocity`  | `analytic-reference`                | yes              | `tests/benchmarks/literature-benchmarks.test.ts` |
| `relativity-timing`          | `relativity-ltte-one-au`             | `canonical-astronomy-target`        | yes              | `tests/benchmarks/literature-benchmarks.test.ts` |
| `relativity-timing`          | `relativity-shapiro-one-au`          | `direct-model-reference`            | no               | `tests/benchmarks/literature-benchmarks.test.ts` |
| `relativity-timing`          | `relativity-shapiro-five-au`         | `direct-model-reference`            | no               | `tests/benchmarks/literature-benchmarks.test.ts` |
| `relativity-timing`          | `relativity-shapiro-multibody`       | `direct-model-reference`            | no               | `tests/benchmarks/literature-benchmarks.test.ts` |
| `detached-binary-photometry` | `binary-photometry-analytic-overlap` | `analytic-reference`                | yes              | `tests/benchmarks/literature-benchmarks.test.ts` |
| `bounded-atmosphere-rt`      | `atmosphere-rt-annulus-reference`    | `high-resolution-numeric-reference` | yes              | `tests/benchmarks/literature-benchmarks.test.ts` |
| `additive-photometry`        | `additive-direct-model-reference`    | `direct-model-reference`            | no               | `tests/benchmarks/literature-benchmarks.test.ts` |
| `exact-event-timing`         | `timing-eccentric-contact-reference` | `independent-geometry-reference`    | yes              | `tests/sim/transit-timing-tracker.test.ts`       |
| `exact-event-timing`         | `timing-moon-contact-reference`      | `independent-geometry-reference`    | yes              | `tests/sim/transit-timing-tracker.test.ts`       |
| `exact-event-timing`         | `timing-grazing-contact-reference`   | `independent-geometry-reference`    | yes              | `tests/sim/transit-timing-tracker.test.ts`       |
| `exact-event-timing`         | `timing-accelerated-moon-reference`  | `independent-geometry-reference`    | yes              | `tests/sim/transit-timing-tracker.test.ts`       |
| `exact-event-timing`         | `timing-accelerated-browser-budget`  | `local-perf-budget`                 | no               | `tests/perf/perf-scenarios.test.ts`              |

The release-evidence flag is deliberate: only independent evidence can be
`yes`. Same-model and local performance regressions are useful engineering
checks, but neither can promote a physical model. A surface with no independent
entry remains an explicitly documented evidence gap.

The first provenance-heavy expansion inside that catalog is now on the relativity surface. Those release-evidence entries carry explicit reference anchors instead of only concise provenance strings:

| Entry ID                            | Reference anchor                                                                                                 | Tolerance                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `relativity-mercury-precession`     | Canonical anomalous Mercury perihelion-precession target: approximately `42.98 arcsec/century`                   | `40 to 46 arcsec/century` with approximate `43` center check    |
| `relativity-ltte-constant-velocity` | Closed-form constant-velocity retarded-time root for the benchmark geometry, independent of the runtime solver   | residual `<= 1e-12 s` and `tEmit` close at 10 decimals          |
| `relativity-ltte-one-au`            | Canonical `1 AU / c` light-time reference: `499.00478 s`                                                         | `498 to 500 s` with close-to reference at 3 decimals            |
| `relativity-shapiro-one-au`         | Repository-relative one-AU solar-limb geometry: approximately `112.643 microseconds`; arbitrary-zero regression  | `100 to 130 microseconds` with close-to reference at 8 decimals |
| `relativity-shapiro-five-au`        | Repository-relative five-AU solar-limb geometry: approximately `144.352 microseconds`; arbitrary-zero regression | `135 to 150 microseconds` with close-to reference at 8 decimals |
| `relativity-shapiro-multibody`      | Same production LTTE/Shapiro helpers summed over the static benchmark geometry; regression-only                  | residual `<= 1e-12 s` and `tEmit` close at 10 decimals          |

The same anchor treatment now also covers the exact-event timing release-evidence entries:

| Entry ID                             | Reference anchor                                                                                                            | Tolerance                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `timing-eccentric-contact-reference` | Independent eccentric-planet projected-sky contact root search over the benchmark orbit, separate from the runtime solver   | ingress, egress, duration, and center close at 3 decimals |
| `timing-moon-contact-reference`      | Independent moon projected-sky contact root search over the benchmark transit geometry, separate from the runtime solver    | ingress, egress, duration, and center close at 3 decimals |
| `timing-grazing-contact-reference`   | Independent near-tangent projected-sky contact root search on the grazing benchmark event, separate from the runtime solver | ingress, egress, duration, and center close at 3 decimals |
| `timing-accelerated-moon-reference`  | Independent moon projected-sky contact root search while `moonOmegaDot` evolves the benchmark event geometry during transit | ingress, egress, duration, and center close at 3 decimals |

The remaining single-entry release surfaces now carry the same explicit anchor treatment:

| Entry ID                             | Reference anchor                                                                                                                                            | Tolerance                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `binary-photometry-analytic-overlap` | Independent uniform-disk eclipse-depth reference from exact circle-overlap area plus passband-resolved luminosity weights on the sampled benchmark geometry | analytic overlap comparison on selected primary and symmetric eclipse cases     |
| `atmosphere-rt-annulus-reference`    | Independent gray annulus-integration reference with `4096` radial samples around the effective circle-only atmosphere opacity helper                        | `max(5e-4, 3 percent of reference opacity)` on selected gray atmosphereRT cases |
| `additive-direct-model-reference`    | Direct photometry-model evaluation of `planetPhase`, `moonPhase`, `forwardScattering`, and `ringScattering` on sampled native snapshot geometry             | all covered additive channels close at 12 decimals                              |

Every `release evidence = yes` entry carries an explicit independent reference
anchor. The Shapiro and additive same-model entries retain anchors for
reproducibility while remaining `release evidence = no`.
