# Security Policy

## Supported versions

Security fixes are provided for the current `main` branch.

## Reporting a vulnerability

Do not open public issues for security vulnerabilities.

Preferred path: GitHub Security Advisories (private report)

1. Open the repository on GitHub.
2. Go to the **Security** tab.
3. Click **Report a vulnerability**.
4. Include a clear reproduction, impact description, and affected versions/commits if known.

If Security Advisories are unavailable, contact the maintainer via GitHub and request a private channel.

## Response expectations

- Initial triage target: within 5 business days.
- You may be asked for additional reproduction details or environment information.
- Coordinated disclosure is preferred; please avoid publishing exploit details before a fix is available.

## Security notes

### Architecture and trust boundaries

- Runtime surface: static Vite browser app, no server-side auth/session layer in this repository.
- Input boundary: browser form controls, lesson response textareas, preset selections, and committed JSON
  scenario/snapshot data.
- File boundary: local maintenance scripts read and write developer-provided paths only when invoked from the
  CLI.
- Network boundary: `scripts/fetch-real-systems-snapshot.mjs` fetches NASA TAP data for the committed real
  systems snapshot; the shipped browser app uses the committed snapshot and does not call the NASA endpoint at
  runtime.
- Security gates: GitHub Actions run CodeQL, gitleaks, and weekly/manual dependency audit; local dependency
  audit is `pnpm audit --audit-level=moderate`.

### Defensive review finding log

#### F-2026-05-01-01: Unbounded NASA snapshot response parsing

- Severity: Low.
- Evidence: `fetchNasaTransitRows()` previously parsed the TAP response with `response.json()` without a
  timeout or response-size limit.
- Impact: a stalled or unexpectedly large upstream response could hang or exhaust resources during local
  snapshot refresh or CI-style maintenance runs.
- Patch: enforce a request timeout and a bounded JSON response body before parsing.
- Regression tests: `tests/scripts/fetch-real-systems-snapshot.test.ts` covers successful bounded parsing,
  oversized `content-length`, and streamed responses that exceed the parser limit.

#### F-2026-05-01-02: Moderate transitive dev dependency denial-of-service advisory

- Severity: Moderate.
- Evidence: `pnpm audit --audit-level=moderate` reports GHSA-f886-m6hf-6m8v for
  `brace-expansion@5.0.2` through ESLint/minimatch development-tooling paths.
- Impact: malicious or accidental zero-step brace patterns can hang or exhaust memory in affected tooling.
  This is not shipped in the browser runtime, but it affects local/CI lint surfaces.
- Patch: add a narrow `pnpm.overrides` entry for `brace-expansion@5.0.5`, refresh the lockfile, and
  tighten local/hosted dependency audits to `pnpm audit --audit-level=moderate`.
- Regression checks: `pnpm why brace-expansion` should resolve to `5.0.5`, and
  `pnpm audit --audit-level=moderate` / `pnpm audit:security` should pass.
