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
./scripts/ci-local.sh   # install + ci:verify + served smoke + specialty gates
```

Equivalent manual gates:

```bash
pnpm ci:verify
pnpm smoke:served
pnpm test:coverage
pnpm audit:deps
pnpm literature-benchmarks   # physics correctness vs. published results
pnpm didactics-acceptance    # educational flow validation
pnpm perf-smoke              # interactive performance budget
pnpm physics-regression      # timing and dynamics regression
pnpm migration-regression    # V3 -> V4 backwards compatibility
pnpm audit:security          # dependency vulnerability scan
```

## Code quality rules

- **No explicit `any` in source**: `@typescript-eslint/no-explicit-any` is enforced as `error` for `src/`. Tests and scripts are exempt. Use proper types, type guards, or narrowing instead of `as any`.
- **Module layering**: Architectural boundaries are enforced by 35 automated tests in `tests/docs/hygiene-layering.test.ts`. Layers: core -> physics -> photometry -> sim -> render/ui -> app.
- **Property-based tests**: Numerical code (Kepler solver, vector ops, transit flux) should have property-based tests in `tests/property/`.
- **Fail-open catch blocks**: All `catch` blocks must have a comment explaining the fallback policy.

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
