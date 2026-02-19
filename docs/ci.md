# CI Overview

## Goals

- Deterministic and reproducible checks.
- Fast feedback for pull requests.
- Security coverage with least-privilege workflow permissions.

## Workflows

- `CI` (`.github/workflows/ci.yml`)
  - Triggers: `pull_request`, `push` on `main`
  - Job: `verify` (Node 22)
  - Main command: `pnpm ci:verify`
  - Cache: pnpm store via `actions/cache` (`~/.pnpm-store`)

- `Security` (`.github/workflows/security.yml`)
  - Triggers: `pull_request`, `push` on `main`
  - Job: `gitleaks`

- `CodeQL` (`.github/workflows/codeql.yml`)
  - Triggers: `pull_request`, `push` on `main`, weekly schedule
  - Job: `analyze`

- `Dependency Audit` (`.github/workflows/dependency-audit.yml`)
  - Triggers: weekly schedule, `workflow_dispatch`
  - Main command: `pnpm audit --audit-level=high --prod`
  - Scope: production dependency graph only (deterministic PR behavior, runtime-first risk focus)

## Local execution

Full local CI parity:

```bash
./scripts/ci-local.sh
```

Optional local security dependency audit:

```bash
CI_AUDIT=1 ./scripts/ci-local.sh
```

Equivalent manual steps:

```bash
pnpm install --frozen-lockfile
pnpm ci:verify
pnpm audit:security
```

## Determinism controls

- OS is pinned (`ubuntu-24.04`).
- Node is pinned in CI (22).
- pnpm is pinned (`pnpm@9.0.0` via Corepack).
- Lockfile is enforced (`--frozen-lockfile`).

## Secrets and permissions

Current workflows do not require repository secrets for standard verification.
If deployment/secrets are added later:

- run only on trusted triggers (`push`/`workflow_dispatch`),
- use GitHub Environments with approval,
- keep workflow permissions minimal.

## Extending CI safely

- Keep PR checks fast (`lint`, `typecheck`, `test`, `build`).
- Run expensive or non-deterministic checks on schedule/manual triggers.
- Always set `timeout-minutes`, explicit permissions, and caching strategy.
