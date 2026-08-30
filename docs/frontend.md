# Browser application

The Browser is a Vite TypeScript single-page application with native controls,
DOM templates, and canvas rendering. `apps/browser/index.html` loads
`src/main.ts`, which starts `src/composition/bootstrap.ts`.

## Boundaries

The Browser source is a modular monolith:

- `domain/` holds models, physics, photometry, simulation, and education rules.
- `application/` holds scenario authoring, catalog work, lifecycle, and use
  cases.
- `infrastructure/` holds workspace and loopback V5 adapters.
- `presentation/` holds DOM, controllers, renderers, and styles.
- `composition/` owns startup wiring.

See [architecture.md](architecture.md) for the dependency rules. Validate any
move or import-boundary change with `pnpm architecture:check`.

## Profiles and external calls

Education runs in the Browser without a service. Scientific profile actions
compile the supported `EducationScenarioV4` subset into a strict V5 request
and use the local service only after a compatible capability response.
The Browser permits only loopback service origins.

Stable DOM identifiers are integration and test contracts. Preserve them when
changing a control, template, or controller. Keep visual output paired with
textual descriptions, preserve invalid input for correction, and announce
meaningful state changes.

## Browser checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm architecture:check
```
