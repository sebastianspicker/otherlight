# Science V5 contract

This directory owns the strict, cross-language scientific request and run
manifest boundary shared by the Browser, the Python service, and the Swift
contract types.

- `forward-request.schema.json` defines a bounded barycentric SI forward job.
- `run-manifest-v2.schema.json` defines implementation, model-version,
  provenance, work-budget, and artifact metadata.
- `contract-cases.json` contains a request/result example used by the hosted
  Browser replay.

The GitHub Pages Browser projects `contract-cases.json#validForwardResult` into a
display-only fixture replay. It does not execute V5, fetch an Arrow artifact, or
turn the current form inputs into a result.

Schemas and the replay example are compatibility data. Update validators and
the affected TypeScript, Python, and Swift consumers together.

The implemented numerical and HTTP boundaries are documented in the
[V5 scientific contract](../../docs/physics/v5-scientific-contract.md) and the
[service guide](../../services/science/README.md).
