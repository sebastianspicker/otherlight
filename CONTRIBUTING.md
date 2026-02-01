# Contributing

## Development

Prerequisites:

- Node.js 18+
- pnpm 9 (recommended)

Install:

```bash
pnpm install --frozen-lockfile
```

Run:

```bash
pnpm dev
```

## Quality gates

Before opening a PR, run:

```bash
pnpm verify-production-ready
```

## Commit messages

Prefer Conventional Commits-style prefixes:

- `feat: ...`
- `fix: ...`
- `test: ...`
- `docs: ...`
- `refactor: ...`
- `chore: ...`

For physics changes, include:

- the model/assumption (what is being approximated),
- the invariants/tests used to validate it,
- any parameter/unit implications.
