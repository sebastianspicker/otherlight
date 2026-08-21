# Documentation

Start with the root [`README.md`](../README.md) for purpose, installation,
configuration, usage, repository structure, and common commands.

## Development and operation

| Document                                   | Contents                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| [`RUNBOOK.md`](RUNBOOK.md)                 | Browser, Scientific service, and native Apple operation and troubleshooting |
| [`ci.md`](ci.md)                           | Local checks, GitHub Actions jobs, and conditional platform gates           |
| [`alpha-release.md`](alpha-release.md)     | Candidate preparation and distribution boundaries                           |
| [`tour.md`](tour.md)                       | Browser screenshot evidence and native capture requirements                 |
| [`frontend.md`](frontend.md)               | Browser shell, state, accessibility, and responsive behavior                |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Development setup and pull-request expectations                             |
| [`../SECURITY.md`](../SECURITY.md)         | Trust boundaries and private vulnerability reporting                        |

## Models and data

| Document                                                                                     | Contents                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`params.md`](params.md)                                                                     | UI controls, units, defaults, and model paths    |
| [`validation.md`](validation.md)                                                             | Input validation, warnings, and failure behavior |
| [`ADDING_BODY.md`](ADDING_BODY.md)                                                           | Adding a body to the browser model               |
| [`physics/overview.md`](physics/overview.md)                                                 | Physics documentation and implementation map     |
| [`physics/model-status.md`](physics/model-status.md)                                         | Model availability and evidence status           |
| [`physics/full-derivation.md`](physics/full-derivation.md)                                   | Formula derivations and assumptions              |
| [`physics/v5-scientific-contract.md`](physics/v5-scientific-contract.md)                     | Scientific request and numerical contract        |
| [`rendering/physics-visualization-contract.md`](rendering/physics-visualization-contract.md) | Simulation-to-visualization data contract        |
| [`references.bib`](references.bib)                                                           | Bibliographic references                         |

## Platform documentation

| Document                                                                           | Contents                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`../science_backend/README.md`](../science_backend/README.md)                     | Python package, HTTP service, limits, and tests                    |
| [`../native-apple/README.md`](../native-apple/README.md)                           | Swift packages, application targets, tests, and macOS distribution |
| [`../native-apple/PRIVACY.md`](../native-apple/PRIVACY.md)                         | Native application data handling                                   |
| [`../contracts/capabilities-v1/README.md`](../contracts/capabilities-v1/README.md) | Cross-platform capability registry                                 |
| [`../contracts/education-v4/README.md`](../contracts/education-v4/README.md)       | Browser/native Education parity fixture                            |
| [`../contracts/workspace-v1/README.md`](../contracts/workspace-v1/README.md)       | Saved workspace schema                                             |

## Design

[`../DESIGN.md`](../DESIGN.md) is the maintained visual and accessibility
contract. [`frontend.md`](frontend.md) explains how that contract maps to the
browser shell. The token registry is
[`design/quiet-observatory.tokens.json`](design/quiet-observatory.tokens.json).

## Documentation checks

Run these commands from the repository root:

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
```

`pnpm hygiene:public` also checks non-ignored untracked files. Build output,
reports, local caches, credentials, and private maintenance material do not
belong in the public documentation tree.
