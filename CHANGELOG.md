# Changelog

All notable changes to this project are documented in this file.

## Unreleased

## [0.1.0] - 2026-04-20

### Breaking

- Removed legacy wrapper modules `src/sim/observer.ts` and `src/sim/timeObserverContract.ts`.
- Canonical imports for observer/time contract now use `src/sim/observerContract.ts`.
- Replaced legacy local verification script names:
  - removed `pnpm verify-production-ready`
  - removed `pnpm turbo`
  - added `pnpm ci:verify` and granular `pnpm ci:*` scripts
- Removed unused backwards-compatible aliases (`TWOPI`, `HALFPI`, `VEC3_ZERO`, `lerp`, `vAssertFinite`, etc.) — 508 lines of dead code removed.
- Removed `src/photometry/transitQuadraticLD.ts` (superseded by V4 native photometry pipeline).
- Removed `src/sim/v4/referenceWorker.ts` (worker handoff retired; replaced by in-thread deterministic `referenceClient.ts`).

### Added

- Added repeatable audit scripts:
  - `pnpm audit:security`
  - `pnpm audit:deps`
  - `pnpm audit:deadcode`
  - `pnpm audit:full`
- Added dead-code audit runner: `scripts/audit-dead-code.sh`.
- Added 10 new test files: unit tests for dom, clone, frames, relativity, forwardScattering, occulterCircle, occulterEllipse, sampling; property-based tests; error recovery tests.
- Added 34 module boundary layering tests enforcing architectural rules.
- Added JSDoc to key exported functions (stepSystem, computeTransitFlux, relativity helpers).
- Added `src/sim/v4/referenceClient.ts`: in-thread deterministic reference runtime replacing the retired worker pipeline.
- Added visualization split modules: `src/app/visualizationScene.ts`, `src/app/visualizationSignals.ts`.
- Added render decomposition modules: `src/render/lightCurvePlotAnnotations.ts`, `src/render/lightCurvePlotAxes.ts`.
- Added `src/app/frameLoopFallback.ts` for fallback frame-loop path.

### Changed

- Upgraded core toolchain dependencies (ESLint, typescript-eslint, Vite, Vitest).
- CI workflow now uses `pnpm ci:verify`.
- Dependency audit workflow now checks production dependency graph (`--prod`).
- GitHub-facing CI/docs/templates were normalized and polished in English.
- Enforced `@typescript-eslint/no-explicit-any` as error for source code (78 `as any` eliminated).
- Moved `cloneParams` to `core/clone.ts` and `SCENARIO_DEFAULTS` to `config/defaults.ts` to fix layering violations.
- Created `sim/limbDarkeningBridge.ts` to fix render/ -> photometry/ violation.
- Improved error handling visibility: catch blocks documented, `initApp()` rejection surfaced.
- Converted the dynamic import of `photometry/limbDarkening` in `optionalLimbDarkening.ts` to a static import, eliminating the Vite INEFFECTIVE_DYNAMIC_IMPORT build warning (the module was already statically bundled by five other modules).
- `scripts/audit-dead-code.sh` orphan allowlist updated: removed stale entries for deleted files `transitQuadraticLD.ts` and `referenceWorker.ts`.
- `docs/refactor-plan.md` stale absolute path prefixes removed.

### Fixed

- Fixed brightness-patch double-counting in `stepSystem()`: patches are now forwarded exclusively via `brightnessPatchesOverride` to the transit integrator. The pre-transit baseline no longer multiplies by `spotFluxFactor`, which previously duplicated the patch attenuation.
- Kepler solver (`solveKeplerE`) hardened for high-eccentricity orbits (e > 0.95): minimum iteration count raised to 60, derivative regularization added near f'(E) = 0 to prevent divergence.
- Resolved all 9 dependency vulnerabilities (rollup, flatted, minimatch, ajv) via upgrades and pnpm overrides.
- Test count increased from 144 to 418 across 93 test files.

### Security

- Security dependency auditing now targets production-impacting packages in CI scheduled runs.
