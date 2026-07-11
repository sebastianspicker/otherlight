# Contributing

## Development setup

Prerequisites:

- Node.js 20.19+ or 22.12+
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
pnpm hygiene:public
./scripts/ci-local.sh   # install + ci:verify + served smoke + specialty gates
```

Add the high-threshold dependency security audit when needed:

```bash
CI_AUDIT=1 ./scripts/ci-local.sh
```

The script is the authoritative local loop. It includes the hosted CI baseline plus served smoke,
coverage, dependency hygiene, scientific calibration, didactics, performance, physics, and migration
gates.

The public-surface check includes non-ignored untracked files. Keep generated reports, local agent
state, editor metadata, absolute workstation paths, credentials, and private evidence outside the
public candidate tree. Maintained project configuration and reproducible documentation should be
tracked rather than hidden through broad ignore rules.

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
