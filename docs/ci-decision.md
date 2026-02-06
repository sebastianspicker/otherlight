# CI Decision

Date: 2026-02-06

## Entscheidung

FULL CI.

## Begruendung

- Das Repo enthaelt ausfuehrbaren TypeScript/Vite-Code mit Tests und Build.
- Die CI kann ohne Secrets laufen und ist reproduzierbar auf GitHub-hosted Runnern.
- Der Nutzen (fruehe Fehlererkennung in Lint/Typecheck/Tests/Build) ist hoch und risikoarm.

## Welche Checks laufen wann

- PR + push auf `main`:
  - `CI` (Lint, Typecheck, Tests, Build) via `pnpm verify-production-ready`
  - `Security` (gitleaks)
  - `CodeQL` (SAST)
- Schedule (woechentlich) + manuell:
  - `Dependency Audit` (`pnpm audit --audit-level=high`)
  - `CodeQL` (woechentlich; bereits in Workflow definiert)

## Threat Model (CI)

- Fork PRs sind untrusted. Daher:
  - Trigger: `pull_request` (nicht `pull_request_target`).
  - Permissions minimal (`contents: read`).
  - Keine Secrets in PR-Jobs.
- Deployments/Secrets: derzeit nicht noetig. Falls spaeter deployt wird, nur auf `push`/`workflow_dispatch` und mit Environments/Approval + OIDC.

## Warum `pnpm audit` nicht auf PRs/push

`pnpm audit` haengt von externen Advisories ab und kann ohne Code-Aenderung rot werden.
Um PRs deterministisch gruen zu halten, laeuft der Audit als eigener, geplanter Workflow.

## Upgrade-Pfad zu noch staerkerer CI

Wenn spaeter FULL+ (z.B. E2E/Performance/Visual) gewuenscht ist, brauchen wir:

- Stabile Browser-Umgebung (z.B. Playwright + Cache, ggf. Self-hosted Runner)
- Testdaten/Fixtures und klare Laufzeitbudgets
- Ggf. Secrets/Deploy-Umgebungen mit Approval
