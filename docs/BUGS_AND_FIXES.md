# Bugs & Required Fixes

List derived from documentation, known limitations, operations runbook, and codebase analysis. Each item can be turned into a separate issue.

---

## Known Limitations / Bugs

### 1. [Limitation] Shapiro delay is point-mass only (star at origin)

**Description:** Shapiro delay is implemented as a point-mass approximation with the star at the origin. The formula uses $\Delta t_{\mathrm{Shapiro}} = \frac{2\mu}{c^3}\,\ln\!\left(\frac{r + z}{r}\right)$ with a minimum impact parameter for regularization. Multi-body or finite-size effects are not modeled.

**Impact:** Timing corrections are approximate; not suitable for high-precision multi-body or close-in configurations where star quadrupole or body finite size matters.

**Fix:** Document clearly as limitation; optionally extend model (e.g. multi-body Shapiro or finite star) if required for science goals. See roadmap “Open Questions” on N-body GR fidelity.

**Sources:** `README.md` (Known limitations), `docs/physics/relativity.md`, `docs/physics/full-derivation.md` (6.2 Shapiro delay)

---

### 2. [Limitation] N-body GR correction is star-centric and approximate

**Description:** In N-body mode, a star-centric 1PN (Schwarzschild) correction is applied. Per-orbit apsidal precession overrides are ignored in N-body mode; Kepler mode uses (a, e, period, c) or override.

**Impact:** GR effects are approximate and star-dominated only. Planet–moon or perturber GR terms are not included. Override parameters in the UI have no effect in N-body mode.

**Fix:** Document in UI or params doc that N-body ignores per-orbit precession overrides. Long-term: full 1PN or post-Newtonian terms for all pairs if needed (see roadmap).

**Sources:** `README.md`, `docs/physics/relativity.md`, `docs/physics/nbody.md`, `src/physics/relativity.ts`

---

### 3. [Limitation] Mutual events use uniform disks (no crescent overlap)

**Description:** Mutual events (planet-moon, etc.) are modeled with uniform disks. Crescent overlap during partial occultations is not modeled.

**Impact:** Flux during mutual events may be less accurate where crescent geometry matters; didactic and moderate-precision use only.

**Fix:** Document as known limitation; optional enhancement: crescent overlap model (roadmap / photometry).

**Sources:** `README.md` (Known limitations)

---

### 4. [CI/Bug] setup-node cache failed when pnpm not in PATH (historical)

**Description:** CI failed because `actions/setup-node` with `cache: pnpm` invoked pnpm before it was installed/activated, so pnpm was not in PATH during cache init.

**Impact:** CI was red on PR/push until fixed.

**Fix:** Enable pnpm via Corepack, set pnpm store path explicitly, and use `actions/cache` for the pnpm store instead of setup-node’s built-in pnpm cache. **Status:** Implemented in `.github/workflows/ci.yml` (Corepack, store path, cache step).

**Sources:** `docs/ci-audit.md` (Root-Cause & Fix-Plan)

---

### 5. [Operational] Dependency audit is external/time-dependent; not on PRs

**Description:** `pnpm audit --audit-level=high` depends on external advisories and can turn red without code changes. It runs only on schedule and `workflow_dispatch`, not on every PR/push.

**Impact:** New vulnerabilities may appear between scheduled runs; PRs stay deterministic but dependency risk is not blocked at merge time.

**Fix:** Document in README or contributing guide that dependency audit runs on schedule and optionally via `CI_AUDIT=1 ./scripts/ci-local.sh`. Consider linking to `docs/ci-decision.md` and `docs/ci-audit.md`.

**Sources:** `docs/ci-audit.md`, `docs/ci-decision.md`, `docs/ci.md`, `.github/workflows/dependency-audit.yml`

---

## Critical

### 6. [Bug] Brightness patches (faculae) cannot increase baseline stellar flux

**Description:** `spotFluxFactorFromPatches()` clamps the disk-averaged patch factor with `clamp01(...)`, so the result is forced into `[0, 1]`. Patch factors &gt; 1 (faculae/bright regions) can never increase the star’s pre-transit baseline flux, contradicting the “spots/faculae” intent and the treatment elsewhere in the same file where patch factors &gt; 1 are allowed in the integrand.

**Impact:** Scientifically wrong out-of-transit normalization and absolute flux scaling whenever patch factors exceed 1.

**Fix:** Allow spot flux factor to exceed 1 when patches represent bright regions, or introduce a separate “baseline brightening” term; document contract for “stellar baseline” vs “patch factor” semantics.

**Sources:** `src/photometry/transitUniformSpots.ts`, `src/sim/sim.ts`

---

### 7. [Bug] `clamp()` turns non-finite values (NaN/±Inf) into midpoint, masking failures

**Description:** In `src/core/units.ts`, `clamp(x, a, b)` returns the midpoint of `[a, b]` when `x` is not finite. Because `clamp01()` and `clamp11()` build on `clamp()`, invalid intermediates can become “reasonable” numbers (e.g. 0.5) and propagate into geometry/photometry without triggering fail-fast.

**Impact:** NaN/Inf from upstream can produce plausible-but-wrong physics outputs instead of clear failures.

**Fix:** Do not substitute a midpoint for non-finite `x`; either return a well-defined sentinel, throw, or document that callers must ensure finite input. Consider a separate `clampFinite()` that throws or returns NaN when `x` is non-finite.

**Sources:** `src/core/units.ts`

---

### 8. [Bug] LTTE/Roemer delay sign and “travel time” semantics vs observer direction

**Description:** `lightTimeDelaySec()` returns `z/c` with `z = dot(r, observerDir)`. The codebase defines `observerDir` as from star toward observer; with that convention, the use of `tEmit = tObs - delay` and the wording “one-way travel time” can imply the opposite directional timing response (e.g. “in front” yielding larger positive delay). This creates a sign/semantics risk for all LTTE-corrected observables.

**Impact:** Timing-sensitive outputs (transit timing, secondary eclipse, phase-dependent diagnostics) can be shifted in the wrong direction when LTTE is enabled.

**Fix:** Reconcile sign convention with `observerDir` (star → observer) and document it in `docs/physics/relativity.md`; ensure `tEmit = tObs - delay` and the formula for delay are consistent. Add a unit or self-test that checks sign for a known geometry.

**Sources:** `src/physics/relativity.ts`, `src/sim/kinematics.ts`, `docs/physics/relativity.md`

---

### 9. [Bug] Optional limb-darkening loader targets wrong export; LD effectively never used for circles

**Description:** The optional limb-darkening loader dynamically imports the transit limb-darkening module and looks for `fluxLimbDarkenedDisk` or default export. The module actually exports `fluxLimbDarkenedDiskDetailed` (returns `{ flux, meta }`) with no number-returning `fluxLimbDarkenedDisk` and no default. The loader therefore never gets a valid integrator, so `getLdIntegrators()` stays null and the simulation always uses uniform-disk (or patched uniform) for circular occulters even when limb darkening is configured.

**Impact:** Limb darkening is effectively skipped for the common circular-occulter case; transit shapes and depths are scientifically wrong when LD is expected.

**Fix:** Align loader and module: either export a number-returning `fluxLimbDarkenedDisk` that wraps the detailed API, or change the loader to use `fluxLimbDarkenedDiskDetailed` and extract `flux`. Ensure error messages and export names are consistent.

**Sources:** `src/sim/optionalLimbDarkening.ts`, `src/photometry/transitLimbDarkened.ts`, `src/sim/transitFlux.ts`

---

### 10. [Bug] UI oblateness checkbox reads wrong property; Apply can delete shape

**Description:** The “Oblate” checkbox state is derived from a property name that does not match the schema (e.g. typo or wrong field). Scenarios with non-zero oblateness can show “Oblate = off”. Because `readUIIntoParams()` uses the checkbox to decide whether to keep or delete `planet.shape` / `moon.shape`, applying params can remove shape configuration.

**Impact:** Misleading UI state and irreversible loss of shape/oblateness config on Apply.

**Fix:** Use the correct schema property for the oblateness checkbox in both `loadParamsIntoUI()` and `readUIIntoParams()`; ensure round-trip preserves shape when oblateness is enabled and finite.

**Sources:** `src/ui/params.ts`, `src/core/typesSystem.ts`

---

### 11. [Bug] `resetSimTimeAndLC()` calls `stepSystem()` with no error handling

**Description:** Reset button, Apply Params, Reset Params, and Apply Preset trigger `resetSimTimeAndLC()`, which calls `stepSystem(params, 0)` synchronously without try/catch. If `stepSystem()` throws (invalid params, N-body maxSteps, validation, etc.), the exception is uncaught and can halt the app or leave the UI in a broken state. The animation loop path does catch `stepSystem()` errors.

**Impact:** Any reset/apply/preset flow can hard-fail the UI and break recovery controls.

**Fix:** Wrap `stepSystem()` in try/catch in `resetSimTimeAndLC()`; on failure, show warning, stop running, and optionally keep last valid step or safe default. Consider updating `lastStepCenter` on successful reset so error-path fallbacks use current params.

**Sources:** `src/main.ts`

---

### 12. [Bug] N-body acceleration treats non-finite `r²` (e.g. Infinity) as overlap; can throw or silently drop forces

**Description:** In the N-body acceleration loop, when `r2 = vLenSq(dr)` is not positive or not finite, the code either throws (only if `throwOnOverlap` and zero softening) or skips the pair with `continue`. Non-finite `r2` (e.g. overflow to Infinity) is therefore treated like overlap, silently zeroing that interaction and potentially producing invalid dynamics.

**Impact:** Silent wrong accelerations or sporadic throws depending on config; scientific output unreliable near degenerate or extreme states.

**Fix:** Explicitly handle non-finite `r2` (e.g. throw or fail closed with a clear error) instead of folding it into overlap logic. Optionally validate state after each step for non-finite positions/velocities.

**Sources:** `src/sim/dynamics.ts`

---

## High

### 13. [Bug] `baselineFlux` applied only to stellar baseline, not to variability or additive terms

**Description:** Variability and additive flux terms are documented as “in stellar flux units”. In `stepSystem()`, `baselineFluxUsed` is applied only to the baseline stellar term (`baselineFluxUsed * spotFluxFactor`), not to `fluxStellarVar`, `fluxPlanetPhase`, `fluxMoonPhase`, or `fluxForwardScattering`. When `photometry.baselineFlux !== 1`, total flux becomes internally inconsistent.

**Impact:** Incorrect absolute fluxes and risk of negative or inconsistent total flux when baselineFlux is used.

**Fix:** Apply the same baseline scaling to variability and additive terms that are defined in stellar units, or document that baselineFlux scales only the direct stellar term and adjust types/docs accordingly.

**Sources:** `src/sim/sim.ts`, `src/core/types.ts`, `src/core/typesPhotometry.ts`

---

### 14. [Bug] Spot flux factor uses uniform disk average; transit factor may use limb-darkened normalization

**Description:** `spotFluxFactorFromPatches()` is a disk-area average independent of limb darkening. When LD is enabled, `computeTransitFlux()` can use a limb-darkened integrator normalized to the unocculted limb-darkened+patched star. The two normalizations differ, so total flux mixes different “unocculted star” definitions.

**Impact:** When both limb darkening and brightness patches are on, out-of-transit level and transit depths can be systematically wrong.

**Fix:** Compute spot baseline factor with the same limb-darkening weighting used for the transit factor, or document and enforce a single convention for “unocculted star” across both paths.

**Sources:** `src/sim/sim.ts`, `src/photometry/transitLimbDarkened.ts`

---

### 15. [Bug] Spectral transmission grid: `tauScale` can misalign with `lambdaNm` after filtering

**Description:** `normalizeSpectralGrid()` filters `lambdaNm` to finite-positive values but does not apply the same filtering to `tauScale`. If the user supplies aligned arrays with some invalid wavelengths, lengths diverge and the code can fall back to all-ones for `tauScale` or mis-handle alignment, changing wavelength-dependent depths silently.

**Impact:** Wrong wavelength-dependent transit depths when invalid entries exist in the wavelength array.

**Fix:** Filter both arrays in lockstep (e.g. keep indices where `lambdaNm` is valid and apply to both), or reject/validate the grid so lengths stay aligned after normalization.

**Sources:** `src/sim/transitFlux.ts`

---

### 16. [Bug] Exponential-halo transmission never equals 1 and has no overlap gating

**Description:** For `exponential-halo`, transmission is `exp(-tau(...))` and is strictly &lt; 1 for any finite tau. Out-of-transit the factor does not reach 1. Transmission occulters are added whenever `sky.z > 0` with no check that the occulter overlaps the stellar disk, so the halo can suppress baseline flux even when the body is far from the star in the sky plane.

**Impact:** Baseline flux can be reduced out of transit; transit-factor semantics (1 when no occultation) are violated.

**Fix:** Gate transmission occulters by geometric overlap with the stellar disk (e.g. same logic as `buildOcculters()`). For exponential-halo, consider a cap or taper so transmission → 1 at large separation, or document that out-of-transit flux may be slightly &lt; 1.

**Sources:** `src/sim/transitFlux.ts`

---

### 17. [Bug] N-body state missing at retarded time: LTTE fallback uses constant position; positions can stay at stale Kepler

**Description:** When LTTE is used with N-body, `rAtTime(ti)` can fall back to a single precomputed `rBary` if `getNBodyStateAt(params, ti)` returns null, so the solver sees a constant position and retarded-time iteration is wrong. If N-body state is missing at `tPlanet`/`tMoon`, `rPlanetAbs`/`rMoonAbs` are never updated and the function returns positions computed at the uncorrected time, mixing time bases silently.

**Impact:** Large, silent geometry errors (wrong sky positions, wrong transit state) when N-body cache/state is incomplete or time is out of range.

**Fix:** Ensure N-body state is available for the time range in use, or provide a documented fallback (e.g. Kepler at retarded time) and avoid returning mixed time-base kinematics. Do not leave positions at initial Kepler values when N-body was requested but state is missing.

**Sources:** `src/sim/kinematics.ts`

---

### 18. [Bug] Optional limb-darkening load is one-shot; transient failure disables LD for the session

**Description:** After the first attempt to load the optional LD module, `optionalLdTried` is set true and `kickoffOptionalLimbDarkeningIfRequested()` never retries. A transient dynamic-import failure (network, cache, bundler) therefore disables limb darkening for the entire session even if a later load would succeed.

**Impact:** Non-deterministic behavior between runs; LD can be permanently off for the session with no recovery.

**Fix:** Allow retry (e.g. reset `optionalLdTried` on explicit “reload” or after a delay), or surface a clear warning/UI state when LD was requested but integrators are null so the user can retry (e.g. reload page or re-apply preset).

**Sources:** `src/sim/optionalLimbDarkening.ts`

---

### 19. [Bug] Validation: orbit angles only checked for finiteness; deg/rad and domain not enforced

**Description:** `assertOrbit()` requires angular fields to be finite but does not enforce radians or physical domains (e.g. inclination in `[0, π]`). Degrees supplied by mistake (e.g. `inc=90`) pass validation and produce wrong sky-plane and light curves.

**Impact:** Scientifically wrong results with no fail-fast message when angles are in wrong units or out of domain.

**Fix:** Validate angle domains (e.g. inc in `[0, π]`) and optionally reject or warn on values that look like degrees (e.g. &gt; 2π). Document units in error messages.

**Sources:** `src/sim/validation.ts`

---

### 20. [Bug] Core step validation covers only a subset of physics inputs

**Description:** `assertStepInputs()` validates orbits, radii, masses, and some photometry fields but not many others (e.g. limb-darkening coefficient domains, brightness patch schema, atmosphere arrays beyond length warning, forward-scattering params). Invalid but finite values can reach photometry/physics and cause NaNs or wrong results without failing at step entry.

**Impact:** Fail-fast is incomplete; errors surface deep in the pipeline with less clear context.

**Fix:** Extend validation to all parameters that can cause numeric or contract failures, or document the validated subset and recommend UI/preset validation for the rest.

**Sources:** `src/sim/validation.ts`, `src/core/typesPhotometry.ts`

---

### 21. [Bug] Ring validation ignores orientation and body-radius relationship

**Description:** `assertRings()` checks only `innerRadius`/`outerRadius` (finiteness and ordering). It does not validate `inclination` or `positionAngle`, nor that ring radii are consistent with body radius. Non-finite orientation or rings inside the body can propagate into occulters without a central assert.

**Fix:** Validate ring orientation fields when present; optionally assert ring inner &gt; body radius (or document that inner &lt; body is allowed). Align with `src/core/typesSystem.ts`.

**Sources:** `src/sim/validation.ts`

---

### 22. [Bug] Hill stability warnings assume prograde; retrograde moon not handled

**Description:** The system supports `moon.sense: "prograde" | "retrograde"`. Hill stability checks use only a prograde limit and never consider `params.moon.sense`, so retrograde configurations can get incorrect “unstable” or “OK” warnings.

**Fix:** When `moon.sense === "retrograde"`, use a retrograde stability heuristic (e.g. existing `maxStableRetrogradeMoonAxisRuleOfThumb`) for warnings; document or unify message set so “OK” is not emitted together with “apo outside Hill”.

**Sources:** `src/physics/hill.ts`, `src/core/typesSystem.ts`

---

### 23. [Bug] UI override mode: sanitizers still clamp inclination and eccentricity

**Description:** Override mode is intended to allow wider ranges, but inclination is always clamped to `[0, 180]` deg and eccentricity to `[0, ECC_MAX]` (e.g. 0.999). Scenario override ranges (e.g. inc -720..720, e max 0.9999) cannot be reached, so some edge cases advertised in config are impossible from the UI.

**Fix:** In override mode, use the scenario override min/max for inclination and eccentricity (or document that override only affects other params). Ensure sanitizers respect override ranges when enabled.

**Sources:** `src/ui/inputs.ts`, `src/config/scenario.default.json`, `src/main.ts`

---

### 24. [Bug] Perturber enabled with mu=0: UI allows it, core validation throws

**Description:** The UI clamps perturber `mu` with a lower bound of 0, so an enabled perturber can have `mu=0`. Core `assertStepInputs()` requires perturber `mu` (or mass) &gt; 0 when enabled and throws. Users can enable a perturber without setting mu and get an immediate step failure.

**Fix:** In UI, require mu &gt; 0 when enabling a perturber (e.g. minimum positive value or disable until set), or show a warning and block Apply until valid. Align with `src/sim/validation.ts`.

**Sources:** `src/ui/params.ts`, `src/sim/validation.ts`

---

### 25. [Bug] Diagnostics duplicate kinematics logic and omit LTTE/GR/drift

**Description:** `computeExoDiagnostics()` builds planet positions over time from orbits/N-body but does not apply LTTE-corrected times, GR precession used in kinematics, or the exomoon sky-plane drift from `getMoonStateAt()`. Diagnostics can disagree with the actual geometry used for flux and occulters.

**Impact:** Meta outputs (e.g. TTV/TDV-style values) can be inconsistent with the simulation; debugging and interpretation are harder.

**Fix:** Reuse the same kinematics path (or a shared “position at time” helper) that includes LTTE, GR, and drift, or document that diagnostics are “approximate” and list excluded effects.

**Sources:** `src/sim/diagnostics.ts`, `src/sim/kinematics.ts`

---

### 26. [Bug] Shapiro delay can go negative and diverge behind star; “impact parameter” is misnamed

**Description:** With `observerDir` from star to observer, a body behind the star has `z ≈ -r`; then `r+z → 0`, the log argument is regularized to a minimum, and the implemented formula can yield large negative “delay” or diverge. The parameter documented as “minimum impact parameter” is actually used as a lower bound on `(r+z)`, not a perpendicular impact parameter.

**Impact:** Non-physical timing near conjunction; parameter tuning and docs are misleading.

**Fix:** Revisit sign and formula for the repo’s observer convention; document or rename the regularization parameter so it matches implementation (e.g. “minimum (r+z)” or compute a true impact parameter). See also LTTE/Roemer sign (Critical #8).

**Sources:** `src/physics/relativity.ts`, `docs/physics/relativity.md`

---

### 27. [Bug] N-body GR correction uses non-symmetric velocity for velocity-dependent term

**Description:** The GR (1PN Schwarzschild) correction depends on velocity. The second acceleration evaluation uses `v + a0*dt` rather than a symmetric half-step velocity, breaking time-reversal symmetry of the velocity-Verlet formulation and potentially causing systematic drift when GR is on.

**Fix:** Use a symmetric or consistent velocity (e.g. half-step velocity) when evaluating the GR term for the second acceleration, or document the deviation from standard velocity-Verlet.

**Sources:** `src/sim/dynamics.ts`

---

### 28. [Bug] `prepareSimulation()` LD warning path never runs

**Description:** `prepareSimulation()` catches errors from `preloadOptionalLimbDarkening()` and warns. The optional loader never throws and instead sets `integrators = null` on failure, so the catch block is never entered and no warning is shown when LD cannot be loaded.

**Fix:** Have the loader signal failure (e.g. throw or return a result object) so `prepareSimulation()` can warn when LD was requested but integrators are null after preload.

**Sources:** `src/sim/sim.ts`, `src/sim/optionalLimbDarkening.ts`

---

## Required Fixes / Improvements (derived from docs)

### 29. [Enhancement] Document N-body vs Kepler behavior for GR/precession

**Description:** N-body mode ignores per-orbit precession overrides; Kepler mode uses them. This is not obvious from the UI or params doc alone.

**Fix:** Add a short note in `docs/params.md` or `docs/physics/relativity.md`: “In N-body mode, per-orbit precession overrides are ignored; star-centric 1PN is used.”

**Sources:** `docs/physics/relativity.md`, `docs/params.md`

---

### 30. [Enhancement] Security/CodeQL: runner pinned, timeout, concurrency

**Description:** Ensure Security and CodeQL workflows use pinned runner, `timeout-minutes`, and (CodeQL) `concurrency` so runs are reproducible and cancellable.

**Fix:** Verify and document in `.github/workflows/security.yml` and `.github/workflows/codeql.yml`; align with recommendations in `docs/ci-audit.md`.

**Sources:** `docs/ci-audit.md`, `.github/workflows/security.yml`, `.github/workflows/codeql.yml`

---

### 31. [Documentation] RUNBOOK: when to run dependency audit locally

**Description:** RUNBOOK documents `pnpm audit --audit-level=high` but does not mention full CI parity with optional audit.

**Fix:** Under “Security” in `docs/RUNBOOK.md`, add: “For CI parity including dependency audit, run: `CI_AUDIT=1 ./scripts/ci-local.sh` (requires network).”

**Sources:** `docs/RUNBOOK.md`, `scripts/ci-local.sh`, `docs/ci.md`

---

### 32. [Operational] Stuck or failed local dev (pnpm / Vite)

**Description:** If pnpm is missing or Vite fails to start, the runbook advises installing pnpm 9.x and, for Vite, clearing `node_modules` and reinstalling.

**Fix:** Already in `docs/RUNBOOK.md` (Troubleshooting). Optionally add a quick-reference table (symptom → cause → fix) in RUNBOOK or README.

**Sources:** `docs/RUNBOOK.md`

---

### 33. [Enhancement] Regression tests for critical numerics (roadmap)

**Description:** Roadmap lists missing regression tests: circle overlap area, limb darkening admissibility, N-body energy drift, LTTE/Shapiro timing convergence.

**Fix:** Add targeted tests; keep anchors in roadmap and `docs/BASELINE.md`.

**Sources:** `docs/roadmap.md` (Engineering Refactors), `docs/BASELINE.md`

---

## Quick reference: common failure causes

| Symptom                                             | Typical cause                                     | Fix / see                                                                                  |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| CI red: “pnpm not found” / cache                    | pnpm not in PATH before cache step                | Use Corepack + explicit store + `actions/cache` (see `ci.yml`)                             |
| Dependency audit not run on PR                      | By design (determinism)                           | Scheduled / manual only; `CI_AUDIT=1 ./scripts/ci-local.sh` locally                        |
| pnpm missing locally                                | pnpm not installed                                | Install pnpm 9.x; `corepack enable` if using Corepack                                      |
| Vite fails to start                                 | Corrupt or inconsistent `node_modules`            | `rm -rf node_modules` then `pnpm install --frozen-lockfile`                                |
| N-body GR/precession “wrong”                        | Overrides ignored in N-body                       | Expected; N-body uses star-centric 1PN only (`docs/physics/relativity.md`)                 |
| Shapiro/timing accuracy                             | Point-mass, star-at-origin only                   | Known limitation; see README and `docs/physics/relativity.md`                              |
| Limb darkening has no effect                        | Loader/module export mismatch; LD path never used | Fix optional LD loader and `transitLimbDarkened` export (Critical #9)                      |
| Reset/Apply/Preset crashes app                      | `stepSystem()` throws in `resetSimTimeAndLC()`    | Add try/catch in `resetSimTimeAndLC()` (Critical #11)                                      |
| Oblateness “off” but value set; Apply removes shape | Checkbox reads wrong property                     | Fix oblateness property name in `params.ts` (Critical #10)                                 |
| Faculae don’t brighten star                         | Spot factor clamped to [0,1]                      | Allow factor &gt; 1 for bright patches (Critical #6)                                       |
| NaN/Inf become “plausible” numbers                  | `clamp()` midpoint for non-finite                 | Change clamp policy or add `clampFinite()` (Critical #7)                                   |
| N-body maxSteps / overlap error                     | Non-finite r² or near-overlap                     | Check initial conditions, dtMax, softening; handle non-finite r² explicitly (Critical #12) |
| LTTE timing direction wrong                         | Sign vs observerDir convention                    | Reconcile and document in relativity docs (Critical #8)                                    |
| Perturber enabled but step throws                   | mu=0 allowed in UI                                | Require mu&gt;0 when enabling perturber (High #24)                                         |
| Override ranges not reachable                       | Incl/ecc always clamped                           | Honor override min/max in sanitizers (High #23)                                            |
| Empty number input → 0                              | `Number("") === 0`; fallback ignored              | Treat empty as “use fallback” or show validation (High: inputs)                            |
| Diagnostics disagree with plot                      | Diagnostics omit LTTE/GR/drift                    | Reuse kinematics or document approximate (High #25)                                        |

---

## Using this list for issues

- **Labels:** `bug`, `enhancement`, `documentation`, `operational`, `ci` as appropriate.
- **Title:** Use the **[Bug]** / **[Limitation]** / **[Enhancement]** part as prefix or label.
- **Body:** Copy the relevant section (description, impact, fix, sources) into the issue.
- The **quick reference** table can be linked from README or RUNBOOK under “Troubleshooting” or “Common issues.”
