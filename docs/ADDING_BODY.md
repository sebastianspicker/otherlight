# Adding an Education body

Adding a body changes the canonical Education model, and it can ripple into V4
serialization, workspace restoration, fixtures, rendering, and the V5 compiler.
Start by deciding whether the body belongs to the supported Education model, the
V5 science subset, or both. Never let a UI control make an unsupported scientific
feature look available.

## Where the code goes

- Data shape and invariants: `apps/browser/src/domain/model/`.
- Orbital, simulation, or photometry behavior: the matching `domain/` module.
- Authoring defaults and presets: `application/catalog/`.
- Form controls and scenario flow: `presentation/scenario/`; canvas drawing:
  `presentation/render/`.
- Workspace and V5 serialization: `infrastructure/`.

The V4 authoring boundary is
`apps/browser/src/application/browserScenarioAdapter.ts`. When the serialized
shape changes on purpose, update the V4 schemas and fixtures under
`contracts/education-v4/` in the same change.

## Can it run scientifically?

The V5 compiler accepts a deliberately limited subset of Education V4. Extend
`apps/browser/src/infrastructure/science/educationScenarioCompiler.ts` only
alongside a strict V5 contract, a Python implementation, and independent
validation. Otherwise reject the feature at compilation time.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm architecture:check
pnpm physics-registry
```

Run the service checks as well if you touched V5 contracts or the compiler. See
[Architecture](ARCHITECTURE.md) for the complete cross-runtime flow.
