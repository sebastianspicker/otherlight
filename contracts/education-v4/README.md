# Education V4 native parity contract

This directory is the checked-in bridge between the existing TypeScript
Education runtime and the shared native Apple implementation.

- `scenario.schema.json` describes the canonical V4 scenario envelope used by
  the scoped native alpha.
- `step.schema.json` describes the deterministic output subset compared across
  TypeScript and Swift.
- `fixture-manifest.schema.json` describes a complete fixture file.
- `pnpm native:fixtures` writes `fixtures/scoped-parity.json`.

TypeScript is the fixture oracle for the `0.3.0-alpha.1` candidate. The scoped
parity contract is green; changing oracle ownership is a future-version
decision.
Fixture values must not be edited by hand. Floating-point comparisons use the
per-field `absolute` and `relative` tolerances in the manifest; identifiers,
enums, booleans, array order, and warning codes compare exactly.
