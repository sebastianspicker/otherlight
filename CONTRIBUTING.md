# Contributing

## Development setup

Prerequisites:

- Node.js 18+
- pnpm 9 (recommended)

Install:

```bash
pnpm install --frozen-lockfile
```

Run locally:

```bash
pnpm dev
```

## Required quality gate

Before opening a pull request, run:

```bash
pnpm ci:verify
```

For dependency security validation (optional locally, mandatory in scheduled CI):

```bash
pnpm audit:security
```

## Commit message style

Prefer Conventional Commits prefixes:

- `feat: ...`
- `fix: ...`
- `test: ...`
- `docs: ...`
- `refactor: ...`
- `chore: ...`

For physics-facing changes, include in your PR description:

- the model/assumption changed,
- the invariants/tests used for validation,
- parameter or unit implications.
