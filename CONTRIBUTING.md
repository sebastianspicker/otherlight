# Contributing

Thanks for your interest in Otherlight. The project is built around two habits:
each product is verified on its own, and every cross-language contract is made
explicit. Before you start, read the [architecture guide](docs/ARCHITECTURE.md)
and skim the entry point and manifest for whatever you plan to touch.

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

The science service requires Python 3.14.6 and `uv==0.10.7`.
Shell checks require ShellCheck. Apple work requires Xcode 26.6 with Swift
6.3.3; see the Apple guide for its exact native commands.

## Quality checks

```bash
pnpm ci:verify
pnpm lint:styles
pnpm lint:shell
```

`ci:verify` checks the Browser source, TypeScript compatibility, and the
production build. The style and shell commands are available separately.

## Browser changes

```bash
pnpm dev
pnpm typecheck
pnpm typecheck:compat
pnpm build
```

Keep domain calculations independent of browser APIs and outer layers. Put use
cases and authoring transitions in `application/`, file and HTTP adapters in
`infrastructure/`, interface effects in the owning `presentation/<feature>/`
folder, and startup wiring in `composition/`. The
[architecture guide](docs/ARCHITECTURE.md#where-new-browser-code-belongs) maps
each folder. Do not create internal packages merely to represent these layers.

Interface changes must preserve accessible names, keyboard and focus behavior,
nonvisual equivalents for canvas output, and stable interface identifiers.
See [the Browser interface guide](docs/frontend.md).

## Contract and model changes

V4, V5, workspace-v1, and capabilities-v1 changes must update their schema or
manifest, validators, and affected TypeScript, Python, and Swift consumers
together.

```bash
pnpm ci:verify
pnpm science:backend:check
```

Changes to capability or scientific-evidence claims must stay within the
boundaries in [model status](docs/physics/model-status.md) and
[validation](docs/validation.md).

## Science service changes

Create the Python 3.14 environment described in the
[service guide](services/science/README.md), then run:

```bash
pnpm science:backend:check
```

Keep HTTP behavior strict and loopback-only. Update V5 schemas and clients when
the wire contract changes. The service has no authentication or supported
remote deployment mode.

## Apple changes

Use Xcode 26.6 and Swift 6.3.3. Package, app-build, and distribution commands are
in [the Apple guide](apps/apple/README.md). At minimum, build the package for
each affected package:

```bash
pnpm native:core:build
pnpm native:science:build
```

The SwiftUI app links `OtherlightCore` products, not the macOS-only
`OtherlightScience` runtime. Do not imply that the app can execute V5 merely
because the independent package builds.

## Before review

Run the root gate and any affected independent lane:

```bash
pnpm ci:verify
```

The GitHub workflows remain the source of truth for CI runner images,
toolchain versions, and destination matrices. If you skip a lane or cannot run
it locally, say so in the pull request rather than leaving it implied. Please
keep credentials, private workspaces, local artifacts, generated reports,
caches, and workstation-specific paths out of a change.
