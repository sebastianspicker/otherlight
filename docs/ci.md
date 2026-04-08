# CI Overview

## Goals

- Deterministic and reproducible checks.
- Fast feedback for pull requests.
- Security coverage with least-privilege workflow permissions.

## Pipeline at a glance

```mermaid
flowchart LR
  PR["pull_request / push"] --> CI["CI workflow"]
  PR --> SEC["Security workflow: gitleaks"]
  PR --> CQL["CodeQL workflow: analyze"]
  SCH["weekly schedule"] --> DEP["Dependency audit workflow"]
  CI --> LINT["lint"]
  CI --> TYPE["typecheck"]
  CI --> TEST["test matrix"]
  CI --> BUILD["build"]
  TEST --> QG["quality gates"]
  LINT --> GATE["Required quality gate"]
  TYPE --> GATE
  TEST --> GATE
  BUILD --> GATE
  QG --> GATE
  SEC --> GATE
  CQL --> GATE
  DEP --> REPORT["Security report and remediation backlog"]
```

## Workflows

- `CI` (`.github/workflows/ci.yml`)
  - Triggers: `pull_request`, `push` on `main`
  - Jobs:
    - `lint` (Node 22): `pnpm ci:lint`
    - `typecheck` (Node 22): `pnpm ci:typecheck`
    - `test` (Node 20 and 22 matrix): `pnpm ci:test`
    - `build` (Node 22): `pnpm ci:build`
    - `quality-gates` (Node 22): `pnpm test:coverage`, `pnpm audit:deps`, `pnpm literature-benchmarks`, `pnpm didactics-acceptance`, `pnpm perf-smoke`, `pnpm physics-regression`, `pnpm migration-regression`
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

Core local verification helper:

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
pnpm test:coverage
pnpm audit:deps
pnpm audit:security
```

Additional CI `quality-gates` commands not covered by `./scripts/ci-local.sh`:

```bash
pnpm literature-benchmarks
pnpm didactics-acceptance
pnpm perf-smoke
pnpm physics-regression
pnpm migration-regression
```

## Determinism controls

- OS is pinned (`ubuntu-24.04`).
- Node is pinned in CI (22).
- pnpm is pinned (`pnpm@9.0.0` via Corepack).
- Lockfile is enforced (`--frozen-lockfile`).

## Required checks for merge

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:coverage`
- `pnpm audit:deps`
- `pnpm literature-benchmarks`
- `pnpm didactics-acceptance`
- `pnpm perf-smoke`
- `pnpm physics-regression`
- `pnpm migration-regression`

## Secrets and permissions

Current workflows do not require repository secrets for standard verification.
If deployment/secrets are added later:

- run only on trusted triggers (`push`/`workflow_dispatch`),
- use GitHub Environments with approval,
- keep workflow permissions minimal.

## Release checklist

Before cutting a release (tag or GitHub release):

1. Run the core local verification helper: `./scripts/ci-local.sh`
2. Run the remaining specialty gates: `pnpm literature-benchmarks`, `pnpm didactics-acceptance`, `pnpm perf-smoke`, `pnpm physics-regression`, `pnpm migration-regression`
3. Optionally run production dependency audit too: `CI_AUDIT=1 ./scripts/ci-local.sh`
4. Ensure `CHANGELOG.md` has a versioned section for the release
5. Tag the version (e.g. `git tag v0.1.0`) and push
6. Optional: refresh real-systems snapshot with `pnpm data:real-systems:refresh` if you want the release to ship updated NASA data

## Extending CI safely

- Keep the core PR jobs explicit and parallelized (`lint`, `typecheck`, `test`, `build`).
- Put additional high-signal quality gates behind a dedicated job rather than hiding them inside one opaque script step.
- Keep scheduled/manual workflows for checks that should not block every PR.
- Always set `timeout-minutes`, explicit permissions, and caching strategy.
