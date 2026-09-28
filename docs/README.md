# Documentation map

New here? Start with the [root README](../README.md) for what Otherlight is and
how to run it, then read [Architecture](ARCHITECTURE.md) before you move Browser
code or change a serialized contract.

Each document below has one audience and one subject.

## Start here

| Document                               | Audience and purpose                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| [Root README](../README.md)            | What the project is, screenshots, quick start, and component navigation           |
| [Architecture](ARCHITECTURE.md)        | Components, dependency rules, data flows, state, interfaces, and non-goals        |
| [Operations runbook](RUNBOOK.md)       | Step-by-step procedures for the Browser, Pages, science service, and Apple builds |
| [Contributing](../CONTRIBUTING.md)     | Change workflow and the checks to run per subsystem                               |
| [Continuous integration](ci.md)        | What each automated lane runs, and where its evidence stops                       |
| [Security policy](../SECURITY.md)      | How to report a problem and which trust boundaries apply                          |
| [Release status](../RELEASE_STATUS.md) | Whether any revision is release-qualified                                         |
| [Product](PRODUCT.md)                  | Users, purpose, voice, principles, and accessibility commitments                  |
| [Design system](DESIGN.md)             | The Plate & Figure visual language and cross-platform interaction rules           |

## Product and contract references

| Document                                                    | Purpose                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Browser interface guide](frontend.md)                      | Interaction, accessibility, rendering, and Browser checks                 |
| [Performance validation](performance.md)                    | Manual responsiveness and retained-memory profiling                       |
| [Validation boundaries](validation.md)                      | What authoring, V4, V5, and workspace validation each own                 |
| [Adding an Education body](ADDING_BODY.md)                  | Cross-layer and cross-contract checklist for a new body                   |
| [Physics overview](physics/overview.md)                     | Education and V5 model scopes by topic                                    |
| [Physics model status](physics/model-status.md)             | Human-readable companion to the authoritative model registry              |
| [V5 scientific contract](physics/v5-scientific-contract.md) | Request, execution, output, and fixture semantics for the scientific lane |
| [V6 contract boundary](../contracts/science-v6/README.md)   | Dataset imports plus strict pending timing and result shapes              |
| [Alpha release procedure](alpha-release.md)                 | How to qualify a specific revision and what evidence to record            |

Component setup and interfaces are documented beside the component:

- [Browser](../apps/browser/README.md)
- [Apple application](../apps/apple/README.md)
- [OtherlightCore](../apps/apple/Packages/OtherlightCore/README.md)
- [OtherlightScience](../apps/apple/Packages/OtherlightScience/README.md)
- [Static screenshot tour](../apps/demo/README.md)
- [Python science service](../services/science/README.md)
- contract READMEs under [`contracts/`](../contracts/)
