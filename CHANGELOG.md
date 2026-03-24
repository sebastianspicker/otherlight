# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Breaking

- Removed legacy wrapper modules `src/sim/observer.ts` and `src/sim/timeObserverContract.ts`.
- Canonical imports for observer/time contract now use `src/sim/observerContract.ts`.
- Replaced legacy local verification script names:
  - removed `pnpm verify-production-ready`
  - removed `pnpm turbo`
  - added `pnpm ci:verify` and granular `pnpm ci:*` scripts
- Removed unused backwards-compatible aliases (`TWOPI`, `HALFPI`, `VEC3_ZERO`, `lerp`, `vAssertFinite`, etc.) — 508 lines of dead code removed.

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

### Changed

- Upgraded core toolchain dependencies (ESLint, typescript-eslint, Vite, Vitest).
- CI workflow now uses `pnpm ci:verify`.
- Dependency audit workflow now checks production dependency graph (`--prod`).
- GitHub-facing CI/docs/templates were normalized and polished in English.
- Enforced `@typescript-eslint/no-explicit-any` as error for source code (78 `as any` eliminated).
- Moved `cloneParams` to `core/clone.ts` and `SCENARIO_DEFAULTS` to `config/defaults.ts` to fix layering violations.
- Created `sim/limbDarkeningBridge.ts` to fix render/ -> photometry/ violation.
- Improved error handling visibility: catch blocks documented, `initApp()` rejection surfaced.

### Fixed

- Resolved all 9 dependency vulnerabilities (rollup, flatted, minimatch, ajv) via upgrades and pnpm overrides.
- Test count increased from 144 to 296+ across 80+ test files.

### Security

- Security dependency auditing now targets production-impacting packages in CI scheduled runs.
