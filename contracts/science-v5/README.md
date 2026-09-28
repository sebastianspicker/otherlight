# Science V5 contract

This directory owns the strict, cross-language scientific request and run
manifest boundary shared by the Browser, the Python service, and the Swift
contract types.

- `forward-request.schema.json` defines a bounded barycentric SI forward job.
- `run-manifest-v2.schema.json` defines implementation, model-version,
  provenance, work-budget, and artifact metadata.
- `contract-cases.json` contains shared valid and invalid request/result cases.
- `canonical-json-cases.json` defines canonical serialization and fingerprint
  cases.
- `scipy-dop853-native-parity.json` records bounded Python/Swift parity input and
  tolerances.

The GitHub Pages Browser projects `contract-cases.json#validForwardResult` into a
display-only fixture replay. It does not execute V5, fetch an Arrow artifact, or
turn the current form inputs into a result.

Schemas and fixtures are compatibility data, so update validators and the
affected TypeScript, Python, and Swift consumers together, then run from the
repository root:

```bash
pnpm contracts:check
pnpm science:verify
pnpm science:backend:test
pnpm native:core:test
pnpm native:science:test
```

The implemented numerical and HTTP boundaries are documented in the
[V5 scientific contract](../../docs/physics/v5-scientific-contract.md) and the
[service guide](../../services/science/README.md).
