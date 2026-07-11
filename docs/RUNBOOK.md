# RUNBOOK

## Purpose

Repeatable commands for setup, development, verification, and security checks.

## Workflow

```mermaid
flowchart TD
  Setup["Install dependencies"] --> Dev["Run dev server"]
  Dev --> Fast["Fast local loop: lint + typecheck + test"]
  Fast --> Full{"Need release-level confidence?"}
  Full -->|No| Continue["Continue feature work"]
  Full -->|Yes| Verify["Run ./scripts/ci-local.sh"]
  Verify --> Ship["Create PR / release candidate"]
```

## Prerequisites

- Node.js 20.19+ or 22.12+ (matches current Vite engine requirements)
- pnpm 9.x for local development (lockfile present)

## Setup

Recommended (reproducible):

```bash
pnpm install --frozen-lockfile
```

## Dev Server

```bash
pnpm dev
```

Open `http://localhost:5173`.

## Fast Loop (local)

```bash
pnpm hygiene:public
pnpm lint
pnpm typecheck
pnpm test
```

## Repository hygiene

Check the current public candidate tree, including non-ignored untracked files:

```bash
pnpm hygiene:public
```

Remove reproducible build, coverage, browser-test, and audit output:

```bash
pnpm clean
```

The hygiene gate rejects local tool state, generated reports, secret-bearing filenames, private-key
material, and absolute user-home paths. Do not use `.gitignore` to hide maintained source, tests, or
configuration required by a clean clone.

## Hosted Baseline Loop

```bash
pnpm ci:verify
```

## Full Loop (local release confidence)

```bash
./scripts/ci-local.sh
```

Add the local moderate-threshold dependency security audit when needed:

```bash
CI_AUDIT=1 ./scripts/ci-local.sh
```

## Lint / Format

```bash
pnpm lint
pnpm format:check
pnpm format
```

## Typecheck

```bash
pnpm typecheck
```

## Tests

```bash
pnpm test
pnpm test:watch
```

## Build / Preview

```bash
pnpm build
pnpm preview
```

## Security (Current Tooling)

Hosted workflows run secret scanning and CodeQL on PR/push. Dependency audit runs weekly or by
manual dispatch. Local dependency security scanning is optional.

Dependency scan (SCA):

```bash
pnpm audit --audit-level=moderate
```

Notes:

- `pnpm audit` requires network access.
- Secret scanning is handled in CI via `gitleaks`.
- SAST is handled in CI via CodeQL.
- `pnpm hygiene:public` is the local filename/private-path boundary check; it complements rather
  than replaces gitleaks.

## Troubleshooting

- If `pnpm` is missing, install pnpm 9.x and re-run `pnpm install --frozen-lockfile`.
- If `npm run dev` or `pnpm dev` fails with `sh: vite: command not found`, `node_modules` is missing or incomplete. Reinstall with pnpm.
- If Vite still fails to start after reinstall, clear `node_modules` and reinstall.

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
```
