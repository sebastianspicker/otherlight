# Validation and Warnings

This project has two validation layers:

1. Hard input validation (throws):

- Implemented in `src/sim/validation/assertions.ts` via `assertStepInputs()` and `assertOrbit()`.
- Enforces finite/positive radii, orbit basics, N-body prerequisites, and key photometry ranges.

2. Soft plausibility warnings (non-fatal):

- Implemented in `src/sim/validation/warnings.ts` via `collectParamWarnings()`.
- Implemented in `src/physics/hill.ts` via `validateSystemParamsPhysics()`.
- Returned warnings are shown in the UI as guidance for likely unphysical or numerically risky setups.

## Common Warning Categories

- High eccentricity (`HIGH_ECC_PLANET`, `HIGH_ECC_MOON`)
- Periapsis inside body radius (`PLANET_PERIA_INSIDE_STAR`, `MOON_PERIA_INSIDE_PLANET`)
- Roche/Hill stability heuristics (`MOON_ROCHE_LIMIT`, `MOON_APO_OUTSIDE_HILL`, `MOON_BEYOND_HILL_STABILITY`)
- Coarse N-body timestep (`NBODY_DT_COARSE`)
- Configuration mismatches (`ATM_LAMBDA_TAUSCALE_MISMATCH`, `NBODY_GR_OVERRIDE_IGNORED`)

## Notes

- Warnings are heuristic by design and do not guarantee physical correctness.
- For reproducible analysis, keep units in SI (m, s, kg, rad) as documented in `docs/physics/overview.md`.
