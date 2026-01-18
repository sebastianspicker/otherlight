# Validation and Sanity Checks

Runtime checks (see `src/sim/validation.ts`):

- Radii and periods must be finite and positive.
- Eccentricity is clamped to e < 1.
- N-body requires static orbit elements for initial conditions.
- mu values must be positive when N-body is enabled.
- Relativity parameters must be finite and positive where required.

Warnings (non-fatal):

- Low grid resolution for photometry.
- N-body enabled with exomoon timing overrides (ignored).
- Per-orbit GR overrides ignored in N-body mode.
