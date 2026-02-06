# CI Overview

## Ziele

- Deterministisch, wartungsarm, schnell (Caching), sicher (least privilege), verlaesslich gruen.

## Workflows

- `CI` (`.github/workflows/ci.yml`)
  - Trigger: `pull_request`, `push` auf `main`
  - Jobs: `verify` (Node 20/22)
  - Schritte: install (frozen lockfile) -> `pnpm verify-production-ready`
  - Cache: pnpm store via `actions/cache` (`~/.pnpm-store`)

- `Security` (`.github/workflows/security.yml`)
  - Trigger: `pull_request`, `push` auf `main`
  - Jobs: `gitleaks`

- `CodeQL` (`.github/workflows/codeql.yml`)
  - Trigger: `pull_request`, `push` auf `main`, woechentlicher Schedule
  - Jobs: `analyze`

- `Dependency Audit` (`.github/workflows/dependency-audit.yml`)
  - Trigger: woechentlicher Schedule, `workflow_dispatch`
  - Jobs: `pnpm audit --audit-level=high`

## Lokal ausfuehren

- Komplett (wie PR CI):

```
./scripts/ci-local.sh
```

- Optional mit Audit:

```
CI_AUDIT=1 ./scripts/ci-local.sh
```

Einzelne Schritte:

```
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Determinismus

- OS ist gepinnt (`ubuntu-24.04`).
- Node ist gepinnt (20/22).
- pnpm Version ist gepinnt (`pnpm@9.0.0` via Corepack).
- Lockfile wird strikt genutzt (`--frozen-lockfile`).

## Secrets

Keine Secrets erforderlich. Wenn spaeter Secrets/Deploys noetig werden:

- nur auf `push`/`workflow_dispatch`
- Environments + Approval
- minimal erforderliche Permissions

## Erweiterung neuer Jobs

- Fast-Checks auf PRs (Lint/Typecheck/Tests/Build)
- Teure oder externe Checks (E2E, Audits, Deploys) nur scheduled oder manuell
- Immer `timeout-minutes`, Caching und minimale `permissions`
