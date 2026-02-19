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

### Added

- Added repeatable audit scripts:
  - `pnpm audit:security`
  - `pnpm audit:deps`
  - `pnpm audit:deadcode`
  - `pnpm audit:full`
- Added dead-code audit runner: `scripts/audit-dead-code.sh`.

### Changed

- Upgraded core toolchain dependencies (ESLint, typescript-eslint, Vite, Vitest).
- CI workflow now uses `pnpm ci:verify`.
- Dependency audit workflow now checks production dependency graph (`--prod`).
- GitHub-facing CI/docs/templates were normalized and polished in English.

### Security

- Security dependency auditing now targets production-impacting packages in CI scheduled runs.
