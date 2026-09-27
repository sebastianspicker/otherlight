# Validation boundaries

Otherlight validates at four distinct boundaries. Knowing which one you are
working in tells you where a new check belongs and what it can prove.

## Browser authoring and Education V4

The Browser validates the mutable `BrowserScenarioDraft` that backs the
interactive Education model, then creates a canonical `EducationScenarioV4`.
Domain checks and warnings belong under `apps/browser/src/domain/`, and the
authoring conversion is in
`apps/browser/src/application/browserScenarioAdapter.ts`. Education output stays
a teaching preview within the model registry's stated limits.

Presentation tests cover browsing sources without committing a model change,
reselection of teaching defaults after a catalog model, restored source
selection, and canceled context changes. Rendered checks also exercise playback,
live sliders, Clear/Undo, history, workspace files, Guided Labs, and
advanced-edit recovery. None of these interface checks establish scientific
model accuracy.

## Strict science V5

The Browser compiles only supported Education V4 input into a barycentric SI V5
request. Both the Browser and the service reject unknown fields, invalid values,
unsupported dynamics, and unavailable capability. A V5 run is not a conversion
of an arbitrary Education result, and no Education result substitutes for a
missing scientific capability.

The Python service independently validates request bounds, barycentric state,
execution limits, result publication, and provenance. See the
[V5 scientific contract](physics/v5-scientific-contract.md).

## Additive science V6 datasets

`science-v5` stays unchanged. The V6 contract corpus defines exact dataset
families plus future job, multi-artifact, and provenance V3 descriptors. The
contract checker enforces schema shape and cross-array semantics, and the Python
service independently enforces the same field, unit, range, monotonicity, and
sample rules after bounded byte streaming and duplicate-safe JSON parsing.

Imported datasets are identified by canonical-content SHA-256, limited by count,
aggregate samples, and retained normalized memory, and cleared on shutdown. The
current `/v2` surface does not execute jobs or publish scientific results.

## Workspace-v1

Workspace parsing is strict and portable. Readers accept only supported
`workspace-v1` documents, restore accepted V4 scenario state through the
infrastructure boundary, and reject unknown versions or fields without mutating
the active session.

Warnings are guidance, not proof of physical correctness. The authoritative
model classification and evidence status are in the
[model registry](physics/model-registry.json).

## Performance invariants

The Browser preview and chromatic tests assert fixed-preview reuse, explicit
invalidation, failed-preview invalidity, Undo metadata, worker/synchronous
sample equality, 100 ms scheduling, bounded pending work, obsolete-generation
rejection, and worker-failure isolation. These are deterministic requirements;
benchmark timing is informational.

Python and Swift compare compact publication with full-state propagation,
including RV values, work counters, manifests, and Arrow data. Full-state physics
parity remains a separate oracle. Python dataset tests cover canonical
duplicates, immutable retained accounting, quotas, and lifecycle races, and
artifact-cache tests use disposable directories to cover retained capacity,
writer ownership, temporary bounds, and explicit offline cleanup.

See [performance validation](performance.md) for reproducible benchmarks,
measurement limits, and the manual Browser and Apple profiling procedures.
