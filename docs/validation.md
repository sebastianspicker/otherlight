# Validation boundaries

Otherlight validates at three distinct boundaries.

## Browser authoring and Education V4

The Browser validates mutable `BrowserScenarioDraft` for its interactive Education
model, then creates a canonical `EducationScenarioV4`. Domain checks and
warnings belong under `apps/browser/src/domain/`; authoring conversion is in
`apps/browser/src/application/browserScenarioAdapter.ts`. Education output is
a teaching preview within the model registry's stated limits.

## Strict science V5

The Browser compiles only supported Education V4 input into a barycentric SI
V5 request. Both Browser and service reject unknown fields, invalid values,
unsupported dynamics, and unavailable capability. A V5 run is not a conversion
of an arbitrary Education result, and no Education result substitutes for a
missing scientific capability.

The Python service independently validates request bounds, barycentric state,
execution limits, result publication, and provenance. See
[physics/v5-scientific-contract.md](physics/v5-scientific-contract.md).

## Workspace-v1

Workspace parsing is strict and portable. Readers accept only supported
`workspace-v1` documents, restore accepted V4 scenario state through the
infrastructure boundary, and reject unknown versions or fields without mutating
the active session.

Warnings are guidance, not proof of physical correctness. The authoritative
model classification and evidence status are in
[physics/model-registry.json](physics/model-registry.json).
