# Otherlight

Otherlight is a local learning and modelling workspace for exoplanet,
exomoon, and detached-binary scenarios. The Browser is the primary product.
It provides interactive Education simulations, Guided Labs, plots, exports,
and `.otherlight` workspaces. An optional local science service executes a
bounded radial-velocity V5 request when its dependencies are available.

The [hosted Browser](https://sebastianspicker.github.io/otherlight/) runs the
Education simulation, Guided Labs, plots, exports, and workspace handling in
the browser. GitHub Pages cannot run the Apple application or Python science
service, so the hosted Scientific profile explains how to use that capability
locally and never attempts a scientific request.

## Products and shared contracts

| Area                | Responsibility                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| `apps/browser/`     | Browser Education and Scientific-profile interface                         |
| `apps/apple/`       | SwiftUI Education app for Apple platforms                                  |
| `apps/demo/`        | Static product tour                                                        |
| `services/science/` | Optional loopback V5 radial-velocity service                               |
| `contracts/`        | Versioned Education V4, science V5, workspace-v1, and capability contracts |

The Browser is a modular monolith, not a collection of JavaScript packages.
Its layers and the science flow are described in
[docs/architecture.md](docs/architecture.md).

## Quick start

Requires Node 22.13 or later and pnpm 11.4.

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL shown in the terminal. Education does not require a network
service.

Build and preview the Browser bundle:

```bash
pnpm build
pnpm preview
```

Build and preview the GitHub Pages variant at `/otherlight/`:

```bash
pnpm build:pages
pnpm preview:pages
```

The Pages variant uses the repository base path and disables loopback science
actions. Ordinary development and production builds retain the local science
boundary. See [docs/RUNBOOK.md](docs/RUNBOOK.md) for the local Pages smoke test
and later activation steps.

## Local science service

The service accepts strict V5 Newtonian barycentric requests and returns
radial-velocity artifacts. It binds to `127.0.0.1:8765`; it is neither a
remote service nor a fallback for Education results.

```bash
python3.14 -m venv services/science/.venv
source services/science/.venv/bin/activate
python -m pip install -e './services/science[dev]'
pnpm science:backend:serve
```

See [services/science/README.md](services/science/README.md) for routes,
limits, dependencies, and failure behaviour.

## Verification

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
pnpm architecture:check
pnpm physics-registry
pnpm ci:verify
```

Targeted checks:

```bash
pnpm science:backend:check
pnpm science:backend:test
pnpm native:core:test
pnpm native:science:test
```

`pnpm ci:verify` covers public-surface and documentation hygiene, the Browser
architecture check, physics registry validation, linting, typechecking, tests,
and the production Browser build. Run service or Apple checks separately when
their code or contracts change.

## Documentation

- [Architecture](docs/architecture.md)
- [Operations](docs/RUNBOOK.md)
- [Browser guide](docs/frontend.md)
- [Validation boundaries](docs/validation.md)
- [Physics model status](docs/physics/model-status.md)
- [Release status](RELEASE_STATUS.md)

## License and security

Otherlight is licensed under [MIT](LICENSE). Report vulnerabilities through
the process in [SECURITY.md](SECURITY.md). Third-party attributions are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
