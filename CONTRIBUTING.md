# Contributing

Thanks for your interest in Otherlight. The project is built around two habits:
each product is verified on its own, and every cross-language contract is made
explicit. Before you start, read the [architecture guide](docs/ARCHITECTURE.md)
and skim the entry point, manifest, and tests for whatever you plan to touch.

Serialized boundaries are the one place where a small edit ripples through
TypeScript, Python, and Swift at once, so treat those changes as deliberate
rather than incidental.

## Setup

The Browser requires Node 22.13 or later and pnpm 11.4. From the repository
root:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
```

The science and complexity lane requires Python 3.14.6 and `uv==0.10.7`.
Shell checks require ShellCheck. Apple work requires Xcode 26.6 with Swift
6.3.3; see the Apple guide for its exact native commands.

## Quality checks

```bash
uv sync --project services/science --locked --extra dev
pnpm quality:check
```

`quality:check` is the canonical production-source quality gate. Its
`quality:static` phase runs the JavaScript lint and format check, Stylelint,
ShellCheck, Knip, the 500-physical-line source ceiling, and JSCPD. JSCPD fails on
any duplicate production-source block of at least 10 lines and 100 tokens; it
excludes tests, generated code, vendor code, contracts, schemas, data,
fixtures, build output, and local tool output. `quality:complexity` runs
`scripts/check-complexity.sh` with the locked Lizard installation after the
Python environment is synchronized.

## Browser changes

```bash
pnpm dev
pnpm typecheck
pnpm typecheck:compat
pnpm test
pnpm architecture:check
pnpm build
```

Keep domain calculations independent of browser APIs and outer layers. Put use
cases and authoring transitions in `application/`, file and HTTP adapters in
`infrastructure/`, interface effects in the owning `presentation/<feature>/`
folder, and startup wiring in `composition/`. The
[architecture guide](docs/ARCHITECTURE.md#where-new-browser-code-belongs) maps
each folder. Do not create internal packages merely to represent these layers.

Interface changes must preserve accessible names, keyboard and focus behavior,
nonvisual equivalents for canvas output, and stable identifiers used by tests.
See [the Browser interface guide](docs/frontend.md).

## Contract and model changes

V4, V5, workspace-v1, and capabilities-v1 changes must update their schema or
manifest, validators, fixtures, and affected TypeScript, Python, and Swift
consumers together.

```bash
pnpm contracts:check
pnpm science:verify
pnpm physics-registry
```

Do not hand-edit generated parity fixtures. Use `pnpm native:fixtures` only for
an intentional Education V4 contract update and review the generated diff.
Changes to capability or scientific-evidence claims must stay within the
boundaries in [model status](docs/physics/model-status.md) and
[validation](docs/validation.md).

## Science service changes

Create the Python 3.14 environment described in the
[service guide](services/science/README.md), then run:

```bash
pnpm science:backend:check
pnpm science:backend:test
```

Keep HTTP behavior strict and loopback-only. Update V5 schemas and clients when
the wire contract changes. The service has no authentication or supported
remote deployment mode.

## Apple changes

Use Xcode 26.6 and Swift 6.3.3. Package, app-test, and distribution commands are
in [the Apple guide](apps/apple/README.md). At minimum, run the package test for
each affected package:

```bash
pnpm native:core:test
pnpm native:science:test
```

The SwiftUI app links `OtherlightCore` products, not the macOS-only
`OtherlightScience` runtime. Do not imply that the app can execute V5 merely
because the independent package builds.

## Before review

Run the root gate and any affected independent lane:

```bash
pnpm contracts:check
pnpm ci:verify
```

The GitHub workflows remain the source of truth for CI runner images,
toolchain versions, and destination matrices. If you skip a lane or cannot run
it locally, say so in the pull request rather than leaving it implied. Please
keep credentials, private workspaces, local artifacts, generated reports,
caches, and workstation-specific paths out of a change.
