# Adding an Education body

Adding a body changes the canonical Education model and may affect V4
serialization, workspace restoration, fixtures, rendering, and the V5 compiler.
Start by deciding whether it belongs to the supported Education model, the V5
science subset, or both. Do not make an unsupported scientific feature appear
available through a UI control.

## Browser placement

- Add data shape and invariants under `apps/browser/src/domain/model/`.
- Add orbital, simulation, or photometry behaviour under the relevant
  `domain/` module.
- Add authoring defaults or presets under `application/`.
- Add controls and rendering under `presentation/`.
- Keep workspace and V5 serialization in `infrastructure/`.

The V4 authoring boundary is
`apps/browser/src/application/browserScenarioAdapter.ts`. Update the V4
schemas and fixtures under `contracts/education-v4/` when the serialized shape
intentionally changes.

## Science eligibility

The V5 compiler accepts a deliberately limited subset of Education V4. Extend
`apps/browser/src/infrastructure/science/educationScenarioCompiler.ts` only
with a corresponding strict V5 contract, Python implementation, and independent
validation. Otherwise reject the feature at compilation time.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm architecture:check
pnpm physics-registry
```

Run the service checks as well if V5 contracts or the compiler changed.
