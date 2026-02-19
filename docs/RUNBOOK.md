# RUNBOOK

## Purpose

Repeatable commands for setup, development, verification, and security checks.

## Prerequisites

- Node.js 18+ (recommended)
- pnpm 9 (recommended; lockfile present)
- npm is supported but not the reproducible path

## Setup

Recommended (reproducible):

```bash
pnpm install --frozen-lockfile
```

Alternative (npm):

```bash
npm install
```

## Dev Server

```bash
pnpm dev
```

Open `http://localhost:5173`.

## Fast Loop (local)

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Full Loop (CI parity)

```bash
pnpm ci:verify
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

CI runs baseline security checks (secret scan, SAST, SCA). Local equivalents are optional.

Dependency scan (SCA):

```bash
pnpm audit --audit-level=high --prod
```

Notes:

- `pnpm audit` requires network access.
- Secret scanning is handled in CI via `gitleaks`.
- SAST is handled in CI via CodeQL.

## Troubleshooting

- If `pnpm` is missing, install pnpm 9.x and re-run `pnpm install --frozen-lockfile`.
- If Vite fails to start, clear `node_modules` and reinstall.

```bash
rm -rf node_modules
pnpm install --frozen-lockfile
```
