# CI Audit

Date: 2026-02-06
Scope: `.github/workflows/*.yml`

## Inventur (Trigger/Jobs/Permissions/Caches)

| Workflow         | Trigger                                    | Jobs                  | Actions (pin)                                    | Permissions                                                 | Cache                          |
| ---------------- | ------------------------------------------ | --------------------- | ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------ |
| CI               | `pull_request`, `push` on `main`           | `verify` (Node 20/22) | checkout v4.3.1, setup-node v4.4.0, cache v4.2.4 | `contents: read`                                            | pnpm store via `actions/cache` |
| Security         | `pull_request`, `push` on `main`           | `gitleaks`            | checkout v4.3.1, gitleaks v2.3.9                 | `contents: read`                                            | none                           |
| CodeQL           | `pull_request`, `push` on `main`, schedule | `analyze`             | checkout v4.3.1, codeql v3.32.1                  | `actions: read`, `contents: read`, `security-events: write` | none                           |
| Dependency Audit | schedule, `workflow_dispatch`              | `audit`               | checkout v4.3.1, setup-node v4.4.0, cache v4.2.4 | `contents: read`                                            | pnpm store via `actions/cache` |

## Letzte fehlgeschlagene Runs

- CI (2026-02-06): `actions/setup-node` mit `cache: pnpm` schlug fehl, weil `pnpm` nicht im PATH war.

## Root-Cause & Fix-Plan

| Workflow         | Failure(s)                                                                   | Root Cause                                                        | Fix Plan                                                                    | Risiko  | Wie verifizieren                                       |
| ---------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- | ------------------------------------------------------ |
| CI               | `actions/setup-node` Cache-Pflicht scheitert, wenn `pnpm` nicht im PATH ist. | Cache-Init ruft `pnpm` auf, bevor pnpm installiert/aktiviert ist. | pnpm per Corepack aktivieren, Store-Path setzen, Cache via `actions/cache`. | Niedrig | GitHub Actions Run auf PR/push.                        |
| Security         | Keine Failure-Logs verfuegbar.                                               | Keine.                                                            | Runner gepinnt + Timeout gesetzt.                                           | Niedrig | GitHub Actions Run auf PR/push.                        |
| CodeQL           | Keine Failure-Logs verfuegbar.                                               | Keine.                                                            | Runner gepinnt + Timeout + Concurrency gesetzt.                             | Niedrig | GitHub Actions Run (PR/push/schedule).                 |
| Dependency Audit | Neu.                                                                         | Audit ist extern/zeitabhaengig.                                   | Nur schedule/manual, klare Trennung von PRs.                                | Mittel  | `CI_AUDIT=1 ./scripts/ci-local.sh` oder Scheduled Run. |
