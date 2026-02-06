# CI Audit

Date: 2026-02-06
Scope: `.github/workflows/*.yml`

## Inventur (Trigger/Jobs/Permissions/Caches)

| Workflow         | Trigger                                    | Jobs                  | Actions (pin)                      | Permissions                                                 | Cache                       |
| ---------------- | ------------------------------------------ | --------------------- | ---------------------------------- | ----------------------------------------------------------- | --------------------------- |
| CI               | `pull_request`, `push` on `main`           | `verify` (Node 20/22) | checkout v4.3.1, setup-node v4.4.0 | `contents: read`                                            | pnpm store via `setup-node` |
| Security         | `pull_request`, `push` on `main`           | `gitleaks`            | checkout v4.3.1, gitleaks v2.3.9   | `contents: read`                                            | none                        |
| CodeQL           | `pull_request`, `push` on `main`, schedule | `analyze`             | checkout v4.3.1, codeql v3.32.1    | `actions: read`, `contents: read`, `security-events: write` | none                        |
| Dependency Audit | schedule, `workflow_dispatch`              | `audit`               | checkout v4.3.1, setup-node v4.4.0 | `contents: read`                                            | pnpm store via `setup-node` |

## Letzte fehlgeschlagene Runs

- Nicht abrufbar aus der aktuellen Umgebung (kein `gh` CLI, kein GitHub API Token).
- Daher keine Log/Annotation-Auswertung verfuegbar. Bitte bei Bedarf mit `gh run list`/`gh run view` nachziehen.

## Root-Cause & Fix-Plan

| Workflow         | Failure(s)                                                                                                              | Root Cause                                                             | Fix Plan                                                                                                        | Risiko  | Wie verifizieren                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| CI               | Keine Failure-Logs verfuegbar. Risiko: PR-Instabilitaet durch `pnpm audit` + `ubuntu-latest` Drift + fehlendes Caching. | Nondeterministische externe Advisories + unpinned Runner + kein Cache. | `pnpm audit` in separaten Scheduled-Workflow verschoben, Runner/Node/pnpm gepinnt, Cache/Timeouts hinzugefuegt. | Niedrig | `./scripts/ci-local.sh` + GitHub Actions Run auf PR/push. |
| Security         | Keine Failure-Logs verfuegbar.                                                                                          | Keine.                                                                 | Runner gepinnt + Timeout gesetzt.                                                                               | Niedrig | GitHub Actions Run auf PR/push.                           |
| CodeQL           | Keine Failure-Logs verfuegbar.                                                                                          | Keine.                                                                 | Runner gepinnt + Timeout + Concurrency gesetzt.                                                                 | Niedrig | GitHub Actions Run (PR/push/schedule).                    |
| Dependency Audit | Neu.                                                                                                                    | Audit ist extern/zeitabhaengig.                                        | Nur schedule/manual, klare Trennung von PRs.                                                                    | Mittel  | `CI_AUDIT=1 ./scripts/ci-local.sh` oder Scheduled Run.    |
