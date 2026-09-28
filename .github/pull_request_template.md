## What changed

- Scope:
- Files or subsystems touched:

## Why

- User/runtime issue addressed:
- Tradeoffs or compatibility notes:

## Verification

- [ ] `pnpm ci:verify`
- [ ] `pnpm audit:security` (for dependency/security-impacting changes)
- [ ] Python backend: `pnpm science:backend:check` and build/install its wheel (when `services/science/` changes)
- [ ] Scientific contracts/physics: review the affected schemas, consumers, and model status (when claims change)
- [ ] Swift packages: `pnpm native:core:build` and `pnpm native:science:build` (when `apps/apple/` changes)
- [ ] Native Apple app: run the documented `xcodebuild build` command for each changed platform (when app/project code changes)
- [ ] UI smoke: `pnpm dev` and check preset switching + light curve render
- [ ] `docs/screenshots/web/` captures are refreshed when the public UI changes, and no generated capture output is committed
- [ ] `contracts/capabilities-v1/manifest.json` is reviewed when website/native Apple behavior or evidence changes
- [ ] Generated reports, local scientific artifacts, and credentials are absent

## Runtime / science notes

- Physics or units assumptions:
- V4 migration or scenario compatibility:
- Known limits or skipped checks:

## Review scope

- Runtime-critical paths touched:
- User-visible surfaces touched:
- Follow-up risks:
