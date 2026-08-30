# Physics overview

The Browser domain contains the Education model: orbital geometry, simulation,
photometry, observables, diagnostics, and teaching signals. Its implementation
is under `apps/browser/src/domain/`.

Education V4 is an interactive preview model. It should not be represented as
a research-calibrated result merely because a configuration passes validation.
The authoritative status, evidence, and limitation of each model are in
[model-registry.json](model-registry.json) and summarised in
[model-status.md](model-status.md).

The optional V5 service has a narrower scope: bounded Newtonian barycentric
propagation for radial velocity, with explicit request validation and run
provenance. It does not provide Browser photometry, inference, atmospheres,
relativity, impact modelling, or remote execution.

Relevant locations:

- orbital calculations: `apps/browser/src/domain/orbits/`
- simulation and observables: `apps/browser/src/domain/simulation/`
- photometry: `apps/browser/src/domain/photometry/`
- V4 model and migration: `apps/browser/src/domain/simulation/v4/`
- V5 Browser compiler: `apps/browser/src/infrastructure/science/`
- V5 service: `services/science/`
