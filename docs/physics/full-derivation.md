# Model references and derivation scope

This repository documents executable model status through
[model-registry.json](model-registry.json), not through a claim that every
teaching approximation is a research model. Use the registry together with
[model-status.md](model-status.md) and the cited bibliography when evaluating a
specific model.

The Browser implements Education-oriented orbital, photometric, and observable
calculations under `apps/browser/src/domain/`. The service implements a
separate bounded V5 Newtonian radial-velocity path under `services/science/`.
Their scopes overlap only through the explicit V4-to-V5 compiler contract.

For the V5 state equations, numerical bounds, collision validity domain, radial
velocity convention, artifacts, and provenance, see
[v5-scientific-contract.md](v5-scientific-contract.md). For placement and data
flow, see [../architecture.md](../architecture.md).
