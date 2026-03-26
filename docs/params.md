# Parameters and Units

Core units (SI):

- Length: meters (m)
- Time: seconds (s)
- Angle: radians in the model (UI uses degrees for selected fields and converts)
- Gravitational parameter: `mu = G * M` in `m^3/s^2`

Key parameter groups:

- `SystemParams.star`: stellar radius and photometry settings
- `SystemParams.planet`: radius, optional mass, orbital elements
- `SystemParams.moon`: radius, optional mass, orbital elements around the planet
- `SystemParams.dynamics`: N-body, relativity, and timing options

Notes:

- If both `planet.m` and `moon.m` are present, the planet orbit is treated as the planet-moon barycenter orbit.
- N-body uses orbital elements as initial conditions.

## UI -> Model Mapping Flow

```mermaid
flowchart LR
  UI["index.html controls"] --> Read["src/ui/params/read.ts"]
  Read --> Helpers["common.ts / nbody.ts / photometry.ts"]
  Helpers --> Params["SystemParams object"]
  Params --> Runtime["Simulation runtime (V4 normalized path)"]
  Runtime --> Output["Flux, geometry, diagnostics"]
  Output --> Load["src/ui/params/load.ts"]
  Load --> UI
```

Mapping implementation:

- `src/ui/params/load.ts` and `src/ui/params/read.ts`
- `src/ui/params/common.ts`, `src/ui/params/nbody.ts`, `src/ui/params/photometry.ts`
- `src/ui/enable.ts`
- `src/main.ts` (measurement pipeline: smearing + instrument noise)

Conventions:

- UI displays selected angles in degrees, model stores radians.
- Many toggles are represented as "field present / field removed" (for example phase curve or relativity block).

---

## Observer

| UI ID       | SystemParams path | Unit | Meaning                     |
| ----------- | ----------------- | ---- | --------------------------- |
| `observerX` | `observer.dir.x`  | arb  | Observer direction (vector) |
| `observerY` | `observer.dir.y`  | arb  | Observer direction (vector) |
| `observerZ` | `observer.dir.z`  | arb  | Observer direction (vector) |

Note: in the UI, `observer.dir` is normalized; a zero vector falls back to `(0,0,1)`. Direct `stepSystem` API usage throws for a zero vector.

## Star (geometry + numerical resolution)

| UI ID          | SystemParams path              | Unit | Meaning                                                |
| -------------- | ------------------------------ | ---- | ------------------------------------------------------ |
| `starR`        | `star.r`                       | m    | Stellar radius                                         |
| `baselineFlux` | `star.photometry.baselineFlux` | 1    | Normalization level (typically `1.0`)                  |
| `gridRes`      | `star.photometry.gridRes`      | 1    | Numerical integration resolution (accuracy vs runtime) |

## Limb darkening (quadratic, optional + multi-band)

| UI ID        | SystemParams path                               | Unit   | Meaning                        |
| ------------ | ----------------------------------------------- | ------ | ------------------------------ |
| `ldEnabled`  | `star.photometry.limbDarkeningModel`            | -      | Toggle: model exists / removed |
| `ldU1`       | `star.photometry.limbDarkeningModel.default.u1` | 1      | Quadratic LD coefficient `u1`  |
| `ldU2`       | `star.photometry.limbDarkeningModel.default.u2` | 1      | Quadratic LD coefficient `u2`  |
| `ldBandpass` | `star.photometry.limbDarkeningModel.bandpass`   | string | Active bandpass key            |
| `ldBands`    | `star.photometry.limbDarkeningModel.bands`      | map    | Bandpass -> (`u1`,`u2`)        |

## Brightness patches (spots/faculae, optional)

| UI ID            | SystemParams path                             | Unit | Meaning                        |
| ---------------- | --------------------------------------------- | ---- | ------------------------------ |
| `patchesEnabled` | `star.photometry.brightnessPatches`           | -    | Toggle: list present / cleared |
| `p1x` / `p1y`    | `star.photometry.brightnessPatches[0].x/.y`   | m    | Patch 1 center (sky plane)     |
| `p1r`            | `star.photometry.brightnessPatches[0].r`      | m    | Patch 1 radius                 |
| `p1f`            | `star.photometry.brightnessPatches[0].factor` | 1    | Patch 1 intensity factor       |
| `p2x` / `p2y`    | `star.photometry.brightnessPatches[1].x/.y`   | m    | Patch 2 center                 |
| `p2rx` / `p2ry`  | `star.photometry.brightnessPatches[1].rx/.ry` | m    | Patch 2 axes                   |
| `p2angle`        | `star.photometry.brightnessPatches[1].angle`  | rad  | Patch 2 orientation            |
| `p2f`            | `star.photometry.brightnessPatches[1].factor` | 1    | Patch 2 intensity factor       |

Spot evolution (rotation/lifetime):

| UI ID                  | SystemParams path                                  | Unit  | Meaning                          |
| ---------------------- | -------------------------------------------------- | ----- | -------------------------------- |
| `spotEvolutionEnabled` | `star.photometry.spotEvolution.enabled`            | -     | Toggle                           |
| `spotRotationPeriod`   | `star.photometry.spotEvolution.rotationPeriodSec`  | s     | Rotation period                  |
| `spotCoverage`         | `star.photometry.spotEvolution.coverage`           | 1     | Scales patch contrast toward `1` |
| `spotLifetime`         | `star.photometry.spotEvolution.lifetimeSec`        | s     | Lifetime (`0` = static)          |
| `spotDriftRate`        | `star.photometry.spotEvolution.driftRateRadPerSec` | rad/s | Additional drift                 |

## Planet: radius + Kepler orbit

| UI ID          | SystemParams path     | Unit       | Meaning                           |
| -------------- | --------------------- | ---------- | --------------------------------- |
| `planetR`      | `planet.r`            | m          | Planet radius                     |
| `planetA`      | `planet.orbit.a`      | m          | Semi-major axis                   |
| `planetE`      | `planet.orbit.e`      | 1          | Eccentricity (`0.. < 1`)          |
| `planetInc`    | `planet.orbit.inc`    | deg -> rad | Inclination                       |
| `planetPeriod` | `planet.orbit.period` | s          | Orbital period                    |
| `planetMass`   | `planet.m`            | kg         | Mass (Hill/barycenter heuristics) |

## Planet: additive phase curve (optional)

These fields live under `star.photometry.phaseCurve` and are added as an additive flux component on top of the transit term.

| UI ID                | SystemParams path                        | Unit | Meaning                |
| -------------------- | ---------------------------------------- | ---- | ---------------------- |
| `planetPhaseEnabled` | `star.photometry.phaseCurve.enabled`     | -    | Toggle                 |
| `planetReflAmp`      | `star.photometry.phaseCurve.reflAmp`     | 1    | Reflection amplitude   |
| `planetThermAmp`     | `star.photometry.phaseCurve.thermAmp`    | 1    | Thermal amplitude      |
| `planetReflOffset`   | `star.photometry.phaseCurve.reflOffset`  | rad  | Phase offset           |
| `planetThermOffset`  | `star.photometry.phaseCurve.thermOffset` | rad  | Phase offset           |
| `planetLambertian`   | `star.photometry.phaseCurve.lambertian`  | -    | Lambert vs cosine      |
| `planetConstant`     | `star.photometry.phaseCurve.constant`    | 1    | Constant additive term |

Thermal inertia:

| UI ID                         | SystemParams path                                   | Unit | Meaning              |
| ----------------------------- | --------------------------------------------------- | ---- | -------------------- |
| `planetThermalInertiaEnabled` | `star.photometry.phaseCurve.thermalInertia.enabled` | -    | Toggle               |
| `planetAlbedo`                | `...albedo`                                         | 1    | `0..1`               |
| `planetEmissivity`            | `...emissivity`                                     | 1    | `0..1`               |
| `planetThermalTimescale`      | `...thermalTimescaleSec`                            | s    | Relaxation timescale |
| `planetRedistribution`        | `...redistribution`                                 | 1    | `0..1`               |

## Planet: shape / rings (transit silhouette)

| UI ID                 | SystemParams path            | Unit       | Meaning                   |
| --------------------- | ---------------------------- | ---------- | ------------------------- |
| `planetOblateEnabled` | `planet.shape.oblateness`    | -          | Toggle                    |
| `planetOblateness`    | `planet.shape.oblateness`    | 1          | Flattening `f` in `[0,1)` |
| `planetRingsEnabled`  | `planet.rings`               | -          | Toggle                    |
| `planetRingInner`     | `planet.rings.innerRadius`   | m          | Ring inner radius         |
| `planetRingOuter`     | `planet.rings.outerRadius`   | m          | Ring outer radius         |
| `planetRingInc`       | `planet.rings.inclination`   | deg -> rad | Ring tilt                 |
| `planetRingAngle`     | `planet.rings.positionAngle` | deg -> rad | Position angle            |

## Forward scattering (optional)

| UI ID          | SystemParams path                           | Unit | Meaning               |
| -------------- | ------------------------------------------- | ---- | --------------------- |
| `fsEnabled`    | `star.photometry.forwardScattering.enabled` | -    | Toggle                |
| `fsAmp`        | `...amp`                                    | 1    | Amplitude             |
| `fsG`          | `...g`                                      | 1    | Henyey-Greenstein `g` |
| `fsSigma`      | `...sigmaPhase`                             | rad  | Width in phase        |
| `fsOffset`     | `...phaseOffset`                            | rad  | Offset                |
| `fsGateBehind` | `...gateWhenBehindStar`                     | -    | Gate when behind star |

## Atmosphere transmission (optional, experimental)

| UI ID         | SystemParams path                                | Unit   | Meaning                     |
| ------------- | ------------------------------------------------ | ------ | --------------------------- |
| `atmEnabled`  | `star.photometry.atmosphereTransmission.enabled` | -      | Toggle                      |
| `atmKind`     | `...kind`                                        | string | `hard` / `exponential-halo` |
| `atmR0`       | `...r0`                                          | m      | Reference radius            |
| `atmH`        | `...H`                                           | m      | Scale height                |
| `atmTau0`     | `...tau0`                                        | 1      | Optical depth scale         |
| `atmLambdaNm` | `...lambdaNm`                                    | nm     | Spectral grid               |
| `atmTauScale` | `...tauScale`                                    | 1      | Tau scaling per band        |

## Moon (optional): radius + orbit around the planet

| UI ID         | SystemParams path               | Unit       | Meaning                          |
| ------------- | ------------------------------- | ---------- | -------------------------------- |
| `moonEnabled` | `moon`                          | -          | Toggle: block present / removed  |
| `moonR`       | `moon.r`                        | m          | Moon radius                      |
| `moonA`       | `moon.orbitAroundPlanet.a`      | m          | Semi-major axis                  |
| `moonE`       | `moon.orbitAroundPlanet.e`      | 1          | Eccentricity                     |
| `moonInc`     | `moon.orbitAroundPlanet.inc`    | deg -> rad | Inclination                      |
| `moonPeriod`  | `moon.orbitAroundPlanet.period` | s          | Orbital period                   |
| `moonMass`    | `moon.m`                        | kg         | Mass (barycenter/Hill heuristic) |

Moon phase curve (optional):

| UI ID              | SystemParams path                        | Unit | Meaning              |
| ------------------ | ---------------------------------------- | ---- | -------------------- |
| `moonPhaseEnabled` | `star.photometry.moonPhaseCurve.enabled` | -    | Toggle               |
| `moonReflAmp`      | `...reflAmp`                             | 1    | Reflection amplitude |
| `moonThermAmp`     | `...thermAmp`                            | 1    | Thermal amplitude    |
| `moonLambertian`   | `...lambertian`                          | -    | Lambert vs cosine    |

## Measurement layer: smearing + instrument noise

Smearing:

| UI ID          | SystemParams path                        | Unit | Meaning                              |
| -------------- | ---------------------------------------- | ---- | ------------------------------------ |
| `smearEnabled` | `star.photometry.cadenceSec/nSubsamples` | -    | Toggle (sets cadence and subsamples) |
| `cadenceSec`   | `star.photometry.cadenceSec`             | s    | Exposure/cadence length              |
| `nSubsamples`  | `star.photometry.nSubsamples`            | 1    | Samples per cadence                  |

Important: `clampSmearedFlux` is a UI-only DOM toggle and is applied in `src/main.ts` during smearing. It is not a `SystemParams` field.

Instrument noise:

- Configuration is in `star.photometry.instrumentNoise` (`src/core/typesPhotometry.ts`).
- Runtime state and application are in `src/photometry/instrumentNoise.ts` and `src/app/noise.ts`.

## Dynamics: exomoon timing shape (hook)

| UI ID                  | SystemParams path                     | Unit  | Meaning                                      |
| ---------------------- | ------------------------------------- | ----- | -------------------------------------------- |
| `exoEnabled`           | `dynamics.exomoonTimingShape.enabled` | -     | Toggle                                       |
| `exoTRef`              | `...tRef`                             | s     | Reference time                               |
| `exoVelDt`             | `...velDt`                            | s     | Finite-difference `dt` for velocity estimate |
| `exoMoonOmegaDot`      | `...moonOmegaDot`                     | rad/s | Node precession                              |
| `exoMoonIncDot`        | `...moonIncDot`                       | rad/s | Inclination drift                            |
| `exoMoonOmegaSmallDot` | `...moonOmegaSmallDot`                | rad/s | Apsis drift                                  |
| `exoImpactYDot`        | `...moonImpactYDot`                   | m/s   | Sky-plane `y` drift                          |

## Dynamics: N-body (Velocity-Verlet)

| UI ID            | SystemParams path                  | Unit      | Meaning                   |
| ---------------- | ---------------------------------- | --------- | ------------------------- |
| `nbodyEnabled`   | `dynamics.nbodyPlanetMoon.enabled` | -         | Toggle                    |
| `nbodyMuStar`    | `...muStar`                        | `L^3/T^2` | `mu = G * M`              |
| `nbodyMuPlanet`  | `...muPlanet`                      | `L^3/T^2` | `mu = G * M`              |
| `nbodyMuMoon`    | `...muMoon`                        | `L^3/T^2` | `mu = G * M`              |
| `nbodyDtMax`     | `...dtMax`                         | s         | Maximum integration step  |
| `nbodySoftening` | `...softening`                     | m         | Plummer softening epsilon |

Perturbers:

- `pert1*` -> `dynamics.nbodyPlanetMoon.perturbers[0]`
- `pert2*` -> `dynamics.nbodyPlanetMoon.perturbers[1]`

## Relativity (LTTE / Shapiro / GR precession)

| UI ID           | SystemParams path             | Unit       | Meaning                |
| --------------- | ----------------------------- | ---------- | ---------------------- |
| `relEnabled`    | `dynamics.relativity.enabled` | -          | Toggle                 |
| `relLTTE`       | `...ltte`                     | -          | Light-time correction  |
| `relShapiro`    | `...shapiro`                  | -          | Shapiro delay          |
| `relGR`         | `...grPrecession`             | -          | GR precession          |
| `relC`          | `...c`                        | m/s        | Speed of light (SI)    |
| `relPlanetPrec` | `...planetPrecessionPerOrbit` | deg -> rad | Override (Kepler mode) |
| `relMoonPrec`   | `...moonPrecessionPerOrbit`   | deg -> rad | Override (Kepler mode) |

---

## Advanced runtime extensions (new, optional)

These fields are additive and backward-compatible. Existing configs remain valid.

## `dynamics`

- `fidelityProfile`: `interactive | accurate | reference`
- `physicsFeatures`:
  - `observables`, `stellarSurface`, `atmosphereRT`, `nonSphericalFlux`, `thermalEnergyBalance`, `detectorRealism`
- `integrator`:
  - `mode`, `errorTolAbs`, `dtMin`, `maxSubsteps`, `growthFactor`, `shrinkFactor`
- `collisionPolicy`:
  - `enabled`, `minSeparation`, `onCloseEncounter`
- `secular`:
  - `enabled`, `j2Precession`, `tides`, `tRef`
- `relativityLevel`: `toy | enhanced`

## Body-level fields (`star`, `planet`, `moon`)

- `spin`:
  - `rotationPeriodSec`, `obliquity`, `axisPositionAngle`
- `gravityHarmonics`:
  - `J2`
- `tides`:
  - `enabled`, `k2`, `Q`, `daDt`, `deDt`

## `star.photometry`

- `stellarSurface`:
  - `enabled`, `useSurfacePatches`, `rotationPeriodSec`, `differentialRotationK`
- `atmosphereRT`:
  - `enabled`, `target`, `lambdaRefNm`, `layers[]`, `scattering`, `emission`
- `spectralBandpass`:
  - `enabled`, `lambdaNm[]`, `weights[]`
- `thermalModelAdvanced`:
  - `enabled`, `equilibriumScale`, `redistribution`, `tauSec`
- `ringScattering`:
  - `enabled`, `amp`, `sigmaPhase`

## Runtime V3 diagnostics fields

`SimulationStepV3.observables` may include:

- `rvStar`, `rvPlanet`, `rvMoon`
- `astrometricOffsetStar.{x,y}`

`SimulationStepV3.timing` may include:

- `lttePlanetSec`, `ltteMoonSec`, `shapiroPlanetSec`, `shapiroMoonSec`

`SimulationStepV3.conservation` may include:

- `energy`, `angularMomentum`

`SimulationStepV3.debug` (render/debug overlay support) may include:

- `nOcculters`, `bPlanet`, `bMoon`, `tdvRatio`
- `vPlanetSky`, `vPlanetSkyRef`
- `baselineFluxUsed`, `stellarVariabilityFlux`

## `SimulationStepV3` -> `DebugOverlayDataV3` mapping

Renderer mapping is implemented in `src/render/canvas2d.ts` (`toOverlayData(...)`).
Rendering contract details are in `docs/rendering/physics-visualization-contract.md`.

| `DebugOverlayDataV3` field | Primary source in `SimulationStepV3` | Renderer fallback                       |
| -------------------------- | ------------------------------------ | --------------------------------------- |
| `nOcculters`               | `debug.nOcculters`                   | `renderSignals.occulterGeometry.length` |
| `bPlanet`                  | `debug.bPlanet`                      | none                                    |
| `bMoon`                    | `debug.bMoon`                        | none                                    |
| `tdvRatio`                 | `debug.tdvRatio`                     | none                                    |
| `vPlanetSky`               | `debug.vPlanetSky`                   | none                                    |
| `vPlanetSkyRef`            | `debug.vPlanetSkyRef`                | none                                    |
| `baselineFluxUsed`         | `debug.baselineFluxUsed`             | `flux.stellarPreTransit`                |
| `stellarVariabilityFlux`   | `debug.stellarVariabilityFlux`       | `flux.stellarVariability`               |
| `fluxTransitFactor`        | `flux.transitFactor`                 | none                                    |
| `fluxTotal`                | `flux.total`                         | none                                    |

---

## V3 namespaced parameter IDs (breaking migration path)

Runtime V3 introduces namespaced UI parameter IDs. Migration helpers are in:

- `src/ui/params/migration.ts`

Example mappings:

- `nbodyMuStar` -> `dynamics.nbody.muStar`
- `nbodyMuPlanet` -> `dynamics.nbody.muPlanet`
- `nbodyMuMoon` -> `dynamics.nbody.muMoon`
- `planetRingInc` -> `bodies.planet.rings.inclinationDeg`
- `planetRingAngle` -> `bodies.planet.rings.positionAngleDeg`
- `relGR` -> `dynamics.relativity.grPrecession`

Helper functions:

- `toNamespacedParamId(...)`
- `toLegacyParamId(...)`
- `migrateParamRecordToNamespaced(...)`
- `migrateParamRecordToLegacy(...)`
