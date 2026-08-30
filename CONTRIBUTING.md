# Contributing

## Before editing

Inspect the affected application, service, or contract first. Preserve
unrelated work in the checkout. Changes to a Browser boundary or a versioned
contract require the relevant focused tests and the architecture check.

The repository is organised around products and explicit cross-language
contracts. Read [docs/architecture.md](docs/architecture.md) before moving
Browser code between layers or changing V4, V5, or workspace-v1 data.

## Setup

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
```

The Browser needs Node 22.13 or later and pnpm 11.4.

## Browser work

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm architecture:check
```

Place new Browser code according to its dependency direction:

- `domain/` has no browser, HTTP, persistence, or presentation imports.
- `application/` coordinates domain operations and authoring state.
- `infrastructure/` owns workspace and local-service adapters.
- `presentation/` owns UI, canvas, and controller effects.
- `composition/` wires the application at startup.

Do not introduce a new internal package merely to express these boundaries.

## Service work

```bash
python3.14 -m venv services/science/.venv
source services/science/.venv/bin/activate
python -m pip install -e './services/science[dev]'
pnpm science:backend:check
pnpm science:backend:test
```

Keep the service loopback-only. Its HTTP behaviour is a V5 contract; update
the schemas and Browser/Apple consumers together when it intentionally
changes.

## Apple work

```bash
pnpm native:core:test
pnpm native:science:test
```

Use the Apple project instructions in [apps/apple/README.md](apps/apple/README.md)
for Xcode and platform-specific checks.

## Full local gate

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
pnpm architecture:check
pnpm physics-registry
pnpm ci:verify
```

Run targeted service and Apple checks in addition to this gate when their code
or contracts changed. Do not commit generated output, local caches, credentials,
or private evidence.
