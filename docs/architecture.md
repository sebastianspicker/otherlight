# Architecture

Otherlight contains three products, one optional local service, and explicit
versioned contracts. It is a repository layout, not a JavaScript package
monorepo.

| Area                | Responsibility                                                |
| ------------------- | ------------------------------------------------------------- |
| `apps/browser/`     | Primary Education and Scientific-profile browser application  |
| `apps/apple/`       | Native Education app and shared Swift packages                |
| `apps/demo/`        | Static, non-executing product tour                            |
| `services/science/` | Loopback V5 radial-velocity job service                       |
| `contracts/`        | Cross-language schemas, fixtures, and capability declarations |

## Browser modular monolith

The Browser has one build, one deployment unit, and explicit source layers:

```text
domain <- application <- presentation <- composition
                  ^              \
                  |               infrastructure
```

`domain/` contains pure models, simulation, photometry, orbital calculations,
and education rules. It cannot depend outward. `application/` coordinates
domain operations, catalogs, lifecycle state, and canonical scenario authoring;
it cannot depend on infrastructure or presentation. `infrastructure/` adapts
workspace files and the loopback service. `presentation/` owns DOM, canvas,
controllers, and styles. `composition/` is the startup wiring layer.

`apps/browser/src/composition/bootstrap.ts` is the application composition
root. The HTML entry loads the Browser module; it does not give domain code a
route to browser globals. `pnpm architecture:check` enforces the prohibited
imports and catches relative TypeScript cycles.

## Data flows

### Education

```text
controls and presets -> BrowserScenarioDraft -> EducationScenarioV4 -> V4 runtime
                                               -> plots, diagnostics, exports
```

`BrowserScenarioDraft` is mutable Browser authoring state. The only authoring boundary
is `application/browserScenarioAdapter.ts`, which makes a canonical,
serializable `EducationScenarioV4`. The V4 runtime executes the supported
Education model. Teaching results are not scientific-service results.

### Scientific request

```text
BrowserScenarioDraft -> EducationScenarioV4 -> strict V5 request
  -> loopback client -> services/science /v1 jobs -> result and manifest
```

`infrastructure/science/educationScenarioCompiler.ts` compiles only the
supported V4 subset into barycentric SI V5 input. Unsupported dynamics or
features fail closed. `presentation/controllers/scienceWorkspace.ts` is the
user-facing trigger; `infrastructure/science/client.ts` is the HTTP adapter.
The service stays on `127.0.0.1:8765` or `localhost:8765` and returns
radial-velocity output only when its advertised capability is available.

### Workspaces

`workspace-v1` persists product context, the accepted Education V4 scenario,
guided-learning state, and an optional strict V5 request. It does not persist
draft text, live tasks, histories, or result artifacts. Restore converts the
V4 scenario back to Browser authoring state at the infrastructure boundary.

## External interfaces

- `contracts/education-v4/` defines canonical Education scenario and parity
  fixtures.
- `contracts/science-v5/` defines strict forward-request and run-manifest
  contracts.
- `contracts/workspace-v1/` defines `.otherlight` documents.
- `contracts/capabilities-v1/manifest.json` states platform and
  capability-gated availability.
- `services/science/` exposes its documented `/v1` loopback HTTP interface.

Keep V4, V5, and workspace-v1 as explicit compatibility boundaries. Browser,
Python, and Swift code should not share implementation code or silently infer
one another's data shapes.

## Placement rules

Put a calculation or invariant in `domain/`; a use case, catalog translation,
or authoring transition in `application/`; a file or HTTP adapter in
`infrastructure/`; a DOM or rendering effect in `presentation/`; and only
wiring in `composition/`. Prefer a local module within the existing product to
new package boundaries.

## Decisions

The Browser remains a modular monolith because its domain, UI, and runtime
change together and are deployed together. The science service remains local
because it has no identity, tenancy, or network trust model. Cross-language
interoperation uses explicit versioned schemas and fixtures so each runtime can
validate independently.
