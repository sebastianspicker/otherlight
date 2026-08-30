## What changed

- Scope:
- Files or subsystems touched:

## Why

- User/runtime issue addressed:
- Tradeoffs or compatibility notes:

## Verification

- [ ] `pnpm ci:verify`
- [ ] `pnpm audit:security` (for dependency/security-impacting changes)
- [ ] Python backend: `pnpm science:backend:check` and `pnpm science:backend:test` (when `services/science/` changes)
- [ ] Scientific contracts/physics: `pnpm science:verify` and `pnpm physics-registry` (when models, contracts, or capability claims change)
- [ ] Swift package: `pnpm native:core:test` (when `apps/apple/` changes)
- [ ] Native Apple app: run the documented Xcode unit-test and UI `build-for-testing` commands for each changed platform (when app/project code changes)
- [ ] UI smoke: `pnpm dev` and check preset switching + light curve render
- [ ] Screenshots are updated when the public UI changes; root `screenshots/` capture output is not included
- [ ] `contracts/capabilities-v1/manifest.json` is reviewed when website/native Apple behavior or evidence changes
- [ ] `pnpm hygiene:public` passes; generated reports, local scientific artifacts, and credentials are absent

## Runtime / science notes

- Physics or units assumptions:
- V4 migration or scenario compatibility:
- Known limits or skipped checks:

## Review scope

- Runtime-critical paths touched:
- User-visible surfaces touched:
- Follow-up risks:
