# Parameters and Units

Core units:

- Length: simulation units (consistent across star/planet/moon radii and orbits).
- Time: seconds.
- Angle: radians in model (UI uses degrees for selected fields and converts).
- Gravitational parameter: mu = G\*M in (L^3 / T^2).

Key parameter groups:

- `SystemParams.star`: radius and photometry settings.
- `SystemParams.planet`: radius, optional mass, orbit elements.
- `SystemParams.moon`: radius, optional mass, orbit elements around planet.
- `SystemParams.dynamics`: N-body/relativity options.

Notes:

- If both `planet.m` and `moon.m` are present, the planet orbit is treated
  as the barycenter orbit.
- N-body uses the orbit elements only as initial conditions.

---

## UI ↔ Modell: Zuordnung (implementierungsgetreu)

Die UI ist in `index.html` definiert. Das Mapping von UI-Feldern (IDs) in das Modell passiert in:

- `src/ui/params.ts` (lesen/schreiben von `SystemParams`)
- `src/ui/enable.ts` (Enable/Disable-Logik, ändert nicht das Modell)
- `src/main.ts` (Messpipeline: Smearing + Instrument noise)

Konvention:

- UI zeigt einige Winkel in **Grad**, das Modell arbeitet in **Radiant**.
- Viele Toggles werden als **„Feld existiert / Feld gelöscht“** modelliert (z.B. Phase Curve, Relativity).

### Beobachter

| UI-ID       | SystemParams-Pfad | Einheit | Bedeutung                   |
| ----------- | ----------------- | ------- | --------------------------- |
| `observerX` | `observer.dir.x`  | arb     | Beobachterrichtung (Vektor) |
| `observerY` | `observer.dir.y`  | arb     | Beobachterrichtung (Vektor) |
| `observerZ` | `observer.dir.z`  | arb     | Beobachterrichtung (Vektor) |

Hinweis: `observer.dir` wird intern normalisiert; ein Nullvektor wird auf `(0,0,1)` gefallbackt.

### Stern (Geometrie + numerische Auflösung)

| UI-ID          | SystemParams-Pfad              | Einheit | Bedeutung                                                   |
| -------------- | ------------------------------ | ------- | ----------------------------------------------------------- |
| `starR`        | `star.r`                       | sim     | Sternradius                                                 |
| `baselineFlux` | `star.photometry.baselineFlux` | 1       | Normierungslevel (typisch 1.0)                              |
| `gridRes`      | `star.photometry.gridRes`      | 1       | Numerische Integrationsauflösung (Genauigkeit vs. Laufzeit) |

### Limb Darkening (quadratisch, optional + multi-band)

| UI-ID        | SystemParams-Pfad                               | Einheit | Bedeutung                                |
| ------------ | ----------------------------------------------- | ------- | ---------------------------------------- |
| `ldEnabled`  | `star.photometry.limbDarkeningModel`            | —       | Toggle: Modell existiert / wird gelöscht |
| `ldU1`       | `star.photometry.limbDarkeningModel.default.u1` | 1       | Quadratischer LD-Koeffizient u1          |
| `ldU2`       | `star.photometry.limbDarkeningModel.default.u2` | 1       | Quadratischer LD-Koeffizient u2          |
| `ldBandpass` | `star.photometry.limbDarkeningModel.bandpass`   | string  | Aktiver Bandpass-Key                     |
| `ldBands`    | `star.photometry.limbDarkeningModel.bands`      | map     | Bandpass → (u1,u2)                       |

### Brightness patches (Spots/Faculae, optional)

| UI-ID            | SystemParams-Pfad                             | Einheit | Bedeutung                          |
| ---------------- | --------------------------------------------- | ------- | ---------------------------------- |
| `patchesEnabled` | `star.photometry.brightnessPatches`           | —       | Toggle: Liste wird gesetzt/geleert |
| `p1x` / `p1y`    | `star.photometry.brightnessPatches[0].x/.y`   | sim     | Patch 1 Zentrum (Sky-plane)        |
| `p1r`            | `star.photometry.brightnessPatches[0].r`      | sim     | Patch 1 Radius                     |
| `p1f`            | `star.photometry.brightnessPatches[0].factor` | 1       | Patch 1 Intensitätsfaktor          |
| `p2x` / `p2y`    | `star.photometry.brightnessPatches[1].x/.y`   | sim     | Patch 2 Zentrum                    |
| `p2rx` / `p2ry`  | `star.photometry.brightnessPatches[1].rx/.ry` | sim     | Patch 2 Achsen                     |
| `p2angle`        | `star.photometry.brightnessPatches[1].angle`  | rad     | Patch 2 Orientierung               |
| `p2f`            | `star.photometry.brightnessPatches[1].factor` | 1       | Patch 2 Intensitätsfaktor          |

Spot evolution (Rotation/Lifetime):

| UI-ID                  | SystemParams-Pfad                                  | Einheit | Bedeutung                          |
| ---------------------- | -------------------------------------------------- | ------- | ---------------------------------- |
| `spotEvolutionEnabled` | `star.photometry.spotEvolution.enabled`            | —       | Toggle                             |
| `spotRotationPeriod`   | `star.photometry.spotEvolution.rotationPeriodSec`  | s       | Rotationsperiode                   |
| `spotCoverage`         | `star.photometry.spotEvolution.coverage`           | 1       | Skaliert Patch-Kontrast Richtung 1 |
| `spotLifetime`         | `star.photometry.spotEvolution.lifetimeSec`        | s       | Lebensdauer (0 = statisch)         |
| `spotDriftRate`        | `star.photometry.spotEvolution.driftRateRadPerSec` | rad/s   | Zusatzdrift                        |

### Planet: Radius + Kepler-Orbit

| UI-ID          | SystemParams-Pfad     | Einheit   | Bedeutung                               |
| -------------- | --------------------- | --------- | --------------------------------------- |
| `planetR`      | `planet.r`            | sim       | Planetenradius                          |
| `planetA`      | `planet.orbit.a`      | sim       | Semi-major axis                         |
| `planetE`      | `planet.orbit.e`      | 1         | Exzentrizität (0..&lt;1)                |
| `planetInc`    | `planet.orbit.inc`    | deg → rad | Inklination (UI in Grad)                |
| `planetPeriod` | `planet.orbit.period` | s         | Orbitalperiode                          |
| `planetMass`   | `planet.m`            | arb       | Masse (für Hill/Barycenter-Heuristiken) |

### Planet: additive Phase Curve (optional)

Diese Parameter sitzen unter `star.photometry.phaseCurve` und werden als additive Flux-Komponente zum Transit addiert.

| UI-ID                | SystemParams-Pfad                        | Einheit | Bedeutung                     |
| -------------------- | ---------------------------------------- | ------- | ----------------------------- |
| `planetPhaseEnabled` | `star.photometry.phaseCurve.enabled`     | —       | Toggle                        |
| `planetReflAmp`      | `star.photometry.phaseCurve.reflAmp`     | 1       | Reflektions-Amplitude         |
| `planetThermAmp`     | `star.photometry.phaseCurve.thermAmp`    | 1       | Thermische Amplitude          |
| `planetReflOffset`   | `star.photometry.phaseCurve.reflOffset`  | rad     | Phasenoffset                  |
| `planetThermOffset`  | `star.photometry.phaseCurve.thermOffset` | rad     | Phasenoffset                  |
| `planetLambertian`   | `star.photometry.phaseCurve.lambertian`  | —       | Lambert vs. Cosine            |
| `planetConstant`     | `star.photometry.phaseCurve.constant`    | 1       | Konstante additive Komponente |

Thermal inertia:

| UI-ID                         | SystemParams-Pfad                                   | Einheit | Bedeutung       |
| ----------------------------- | --------------------------------------------------- | ------- | --------------- |
| `planetThermalInertiaEnabled` | `star.photometry.phaseCurve.thermalInertia.enabled` | —       | Toggle          |
| `planetAlbedo`                | `...albedo`                                         | 1       | 0..1            |
| `planetEmissivity`            | `...emissivity`                                     | 1       | 0..1            |
| `planetThermalTimescale`      | `...thermalTimescaleSec`                            | s       | Relaxationszeit |
| `planetRedistribution`        | `...redistribution`                                 | 1       | 0..1            |

### Planet: Shape / Rings (Transit-Silhouette)

| UI-ID                 | SystemParams-Pfad            | Einheit   | Bedeutung             |
| --------------------- | ---------------------------- | --------- | --------------------- |
| `planetOblateEnabled` | `planet.shape.oblateness`    | —         | Toggle                |
| `planetOblateness`    | `planet.shape.oblateness`    | 1         | Flattening f in [0,1) |
| `planetRingsEnabled`  | `planet.rings`               | —         | Toggle                |
| `planetRingInner`     | `planet.rings.innerRadius`   | sim       | Ring inner radius     |
| `planetRingOuter`     | `planet.rings.outerRadius`   | sim       | Ring outer radius     |
| `planetRingInc`       | `planet.rings.inclination`   | deg → rad | Ring tilt             |
| `planetRingAngle`     | `planet.rings.positionAngle` | deg → rad | Position angle        |

### Forward scattering (optional)

| UI-ID          | SystemParams-Pfad                           | Einheit | Bedeutung              |
| -------------- | ------------------------------------------- | ------- | ---------------------- |
| `fsEnabled`    | `star.photometry.forwardScattering.enabled` | —       | Toggle                 |
| `fsAmp`        | `...amp`                                    | 1       | Amplitude              |
| `fsG`          | `...g`                                      | 1       | Henyey-Greenstein g    |
| `fsSigma`      | `...sigmaPhase`                             | rad     | Breite in Phase        |
| `fsOffset`     | `...phaseOffset`                            | rad     | Offset                 |
| `fsGateBehind` | `...gateWhenBehindStar`                     | —       | Gate wenn hinter Stern |

### Atmosphere transmission (optional, experimentell)

| UI-ID         | SystemParams-Pfad                                | Einheit | Bedeutung                   |
| ------------- | ------------------------------------------------ | ------- | --------------------------- |
| `atmEnabled`  | `star.photometry.atmosphereTransmission.enabled` | —       | Toggle                      |
| `atmKind`     | `...kind`                                        | string  | `hard` / `exponential-halo` |
| `atmR0`       | `...r0`                                          | sim     | Referenzradius              |
| `atmH`        | `...H`                                           | sim     | Scale height                |
| `atmTau0`     | `...tau0`                                        | 1       | Optical depth scale         |
| `atmLambdaNm` | `...lambdaNm`                                    | nm      | Spektralgrid                |
| `atmTauScale` | `...tauScale`                                    | 1       | Tau-Skalierung pro Band     |

### Mond (optional): Radius + Orbit um den Planeten

| UI-ID         | SystemParams-Pfad               | Einheit   | Bedeutung                               |
| ------------- | ------------------------------- | --------- | --------------------------------------- |
| `moonEnabled` | `moon`                          | —         | Toggle: Block existiert / wird gelöscht |
| `moonR`       | `moon.r`                        | sim       | Mondradius                              |
| `moonA`       | `moon.orbitAroundPlanet.a`      | sim       | Semi-major axis                         |
| `moonE`       | `moon.orbitAroundPlanet.e`      | 1         | Exzentrizität                           |
| `moonInc`     | `moon.orbitAroundPlanet.inc`    | deg → rad | Inklination                             |
| `moonPeriod`  | `moon.orbitAroundPlanet.period` | s         | Orbitalperiode                          |
| `moonMass`    | `moon.m`                        | arb       | Masse (Barycenter/Hill-Heuristik)       |

Mond-Phase Curve (optional):

| UI-ID              | SystemParams-Pfad                        | Einheit | Bedeutung             |
| ------------------ | ---------------------------------------- | ------- | --------------------- |
| `moonPhaseEnabled` | `star.photometry.moonPhaseCurve.enabled` | —       | Toggle                |
| `moonReflAmp`      | `...reflAmp`                             | 1       | Reflektions-Amplitude |
| `moonThermAmp`     | `...thermAmp`                            | 1       | Thermische Amplitude  |
| `moonLambertian`   | `...lambertian`                          | —       | Lambert vs. Cosine    |

### Messlayer: Smearing + Instrument noise

Smearing:

| UI-ID          | SystemParams-Pfad                        | Einheit | Bedeutung                          |
| -------------- | ---------------------------------------- | ------- | ---------------------------------- |
| `smearEnabled` | `star.photometry.cadenceSec/nSubsamples` | —       | Toggle (setzt cadence/nSubsamples) |
| `cadenceSec`   | `star.photometry.cadenceSec`             | s       | Expositions-/Cadence-Länge         |
| `nSubsamples`  | `star.photometry.nSubsamples`            | 1       | Samples pro Cadence                |

Wichtig: `clampSmearedFlux` ist ein UI-only Toggle (DOM) und wird in `src/main.ts` beim Smearing angewandt; es ist kein `SystemParams`-Feld.

Instrument noise:

- Konfiguration lebt in `star.photometry.instrumentNoise` (siehe `src/core/typesPhotometry.ts`).
- Anwendung/State in `src/photometry/instrumentNoise.ts` und `src/app/noise.ts`.

### Dynamik: Exomoon timing shape (Hook)

| UI-ID                  | SystemParams-Pfad                     | Einheit | Bedeutung                      |
| ---------------------- | ------------------------------------- | ------- | ------------------------------ |
| `exoEnabled`           | `dynamics.exomoonTimingShape.enabled` | —       | Toggle                         |
| `exoTRef`              | `...tRef`                             | s       | Referenzzeit                   |
| `exoVelDt`             | `...velDt`                            | s       | Finite-diff dt für v-Schätzung |
| `exoMoonOmegaDot`      | `...moonOmegaDot`                     | rad/s   | Knotenpräzession               |
| `exoMoonIncDot`        | `...moonIncDot`                       | rad/s   | Inc-Drift                      |
| `exoMoonOmegaSmallDot` | `...moonOmegaSmallDot`                | rad/s   | Apsis-Drift                    |
| `exoImpactYDot`        | `...moonImpactYDot`                   | sim/s   | Sky-plane y drift              |

### Dynamik: N-body (Velocity-Verlet)

| UI-ID            | SystemParams-Pfad                  | Einheit | Bedeutung                |
| ---------------- | ---------------------------------- | ------- | ------------------------ |
| `nbodyEnabled`   | `dynamics.nbodyPlanetMoon.enabled` | —       | Toggle                   |
| `nbodyMuStar`    | `...muStar`                        | L^3/T^2 | mu = G\*M                |
| `nbodyMuPlanet`  | `...muPlanet`                      | L^3/T^2 | mu = G\*M                |
| `nbodyMuMoon`    | `...muMoon`                        | L^3/T^2 | mu = G\*M                |
| `nbodyDtMax`     | `...dtMax`                         | s       | Max. Integrationsschritt |
| `nbodySoftening` | `...softening`                     | sim     | Plummer softening eps    |

Perturbers:

- `pert1*` → `dynamics.nbodyPlanetMoon.perturbers[0]`
- `pert2*` → `dynamics.nbodyPlanetMoon.perturbers[1]`

### Relativität (LTTE / Shapiro / GR precession)

| UI-ID           | SystemParams-Pfad             | Einheit   | Bedeutung                         |
| --------------- | ----------------------------- | --------- | --------------------------------- |
| `relEnabled`    | `dynamics.relativity.enabled` | —         | Toggle                            |
| `relLTTE`       | `...ltte`                     | —         | Light-time correction             |
| `relShapiro`    | `...shapiro`                  | —         | Shapiro delay                     |
| `relGR`         | `...grPrecession`             | —         | GR precession                     |
| `relC`          | `...c`                        | sim/s     | Lichtgeschwindigkeit in sim units |
| `relPlanetPrec` | `...planetPrecessionPerOrbit` | deg → rad | Override (Kepler-mode)            |
| `relMoonPrec`   | `...moonPrecessionPerOrbit`   | deg → rad | Override (Kepler-mode)            |
