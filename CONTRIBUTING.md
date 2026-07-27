# Contributing

## Development setup

Browser changes require Node.js 22.13.0 or later, Corepack, and pnpm 11.4.0.

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm dev
```

Scientific service changes require Python 3.14:

```bash
python3.14 -m venv science_backend/.venv
source science_backend/.venv/bin/activate
python -m pip install -e './science_backend[dev]'
```

Native Apple changes require Swift 6.3.3. Xcode project, simulator, archive, and
screenshot checks require Xcode 26.6.

```bash
source scripts/select-swift-toolchain.sh
```

## Change scope

Keep changes within the owning layer:

```text
core -> physics -> photometry -> sim -> render/ui -> app
```

Tests in `tests/docs/hygiene-layering.test.ts` enforce this dependency order.
Versioned cross-runtime behavior belongs in `contracts/`, not in an
implementation-specific test fixture.

When changing a numerical model, document:

- equations and assumptions;
- units and coordinate frames;
- validity limits;
- error and fallback behavior;
- tests or references that support the change.

Update `docs/physics/model-registry.json` when a model, formula owner, or
evidence path changes.

## Code requirements

- TypeScript source must not use explicit `any`.
- Exported numerical, stateful, validation, I/O, cache, and scheduling
  boundaries require concise API documentation.
- Every executable source file requires a short module-purpose comment or
  docstring.
- Native Swift declarations require concise documentation comments.
- Catch blocks must make fallback behavior explicit.
- Runtime queues and polling loops must remain bounded.
- Scientific errors must not silently fall back to Education results.

Follow the existing formatter and naming conventions. Do not add dependencies
without discussing the requirement first.

## Tests

Run the narrowest relevant test while editing, then the broad gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm ci:verify
```

The complete browser loop is:

```bash
./scripts/ci-local.sh
```

It installs Playwright browsers and runs E2E, served-bundle smoke, coverage,
dependency audit, science contract checks, benchmarks, didactics, performance,
physics, and migration checks. Run Python and Apple checks separately.

### Scientific service

```bash
source science_backend/.venv/bin/activate
python -m ruff format --check science_backend
python -m ruff check science_backend
python -m pyright science_backend
PYTHONPATH=science_backend python -m pytest science_backend/tests
python -m build --wheel science_backend
```

### Native Apple application

```bash
source scripts/select-swift-toolchain.sh
swift format lint --strict --recursive native-apple
swift test --package-path native-apple/Packages/OtherlightCore
swift test --package-path native-apple/Packages/OtherlightScience

DEVELOPER_DIR=/Applications/Xcode-26.6.0.app/Contents/Developer \
  xcodebuild test \
  -project native-apple/Otherlight.xcodeproj \
  -scheme Otherlight \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO
```

Use `--disable-sandbox` only when SwiftPM fails because the host blocks its
process sandbox.

## Documentation and screenshots

Documentation must describe the current source and commands. Remove obsolete
instructions when behavior changes.

Run:

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
pnpm verify:tour
```

For browser-visible changes:

```bash
pnpm capture:tour:web
```

This command uses the local Vite capture server and deterministic Scientific
contract state. Use `pnpm capture:tour:web:live` only while a verified local
Scientific service is running. Use `pnpm capture:tour:web:static` when a normal
capture server cannot bind.

Native screenshots require the exact Xcode and simulator destinations:

```bash
DEVELOPER_DIR=/Applications/Xcode-26.6.0.app/Contents/Developer \
  pnpm capture:tour:apple --preflight
```

Do not replace maintained screenshots without updating their manifest and
running `pnpm verify:tour`.

## Pull requests

Describe:

- the affected runtime or contract;
- user-visible behavior changes;
- commands run and their results;
- checks not run and why;
- compatibility or migration effects;
- screenshots for visible changes.

Keep local caches, reports, credentials, signing material, environment files,
and build products out of the public change.

Use clear commit subjects. Conventional Commit prefixes are accepted but not
required.

## Security

Do not include vulnerability details in a public issue or pull request. Follow
[`SECURITY.md`](SECURITY.md) for private reporting.
