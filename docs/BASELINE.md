# Baseline Capture

Date: 2026-02-04

## What ran

```bash
BASELINE_CAPTURE=1 pnpm test -- tests/baseline/baselineCapture.test.ts
```

## Current Features (snapshot)

- 2D sky-plane visualization of star/planet/moon system.
- Keplerian kinematics (default) and N-body dynamics (velocity-Verlet) with optional perturbers.
- Transit photometry: uniform disk + limb darkening.
- Oblateness + rings in silhouette.
- Phase curves (planet/moon), stellar variability, forward scattering (optional).
- Relativity-inspired timing corrections (LTTE/Shapiro/GR approximations).
- Instrument noise + smearing (optional).

## Presets (from `src/app/presets.ts`)

- `default`: scientific baseline (planet+moon, LD, optional diagnostics).
- `kepler-planet-only`: planet-only transit for geometry.
- `limb-darkening-variation`: stronger LD + multi-band coefficients.
- `nbody-with-perturber`: N-body with star reflex + perturber.

## Physics Model (current)

- Length: meters (SI), Time: seconds, Angles: radians (UI uses degrees for some inputs).
- Orbits: Kepler elements for kinematic mode; N-body uses velocity-Verlet integrator.
- Flux model: multiplicative transit factor + additive components.

## Performance Snapshot

- `stepSystem` average time: \10.013345\2 (2000 steps; default preset; Node/Vitest).

## Baseline Numeric Logs

```
BASELINE_SNAPSHOTS_START
[
  {
    "presetId": "default",
    "tSec": 0,
    "fluxTotal": 1.0000307444149867,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": 4865522070.342241,
      "y": 0,
      "z": 4865522070.342241
    },
    "moonSky": {
      "x": 5004114999.454804,
      "y": 0,
      "z": 5004114999.454804
    },
    "rBary": {
      "x": 6881502052.200001,
      "y": 0,
      "z": 0
    },
    "rPlanetAbs": {
      "x": 6880887299.903617,
      "y": 0,
      "z": 0
    },
    "rMoonAbs": {
      "x": 7076887299.903617,
      "y": 0,
      "z": 0
    }
  },
  {
    "presetId": "default",
    "tSec": 88164.436325,
    "fluxTotal": 0.9999910793785075,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": -6020100166.229843,
      "y": 1291207937.3599813,
      "z": 4331124076.87114
    },
    "moonSky": {
      "x": -5987240343.811238,
      "y": 1094905729.785568,
      "z": 4315033194.121961
    },
    "rBary": {
      "x": -1194249255.3183541,
      "y": 1290592237.1921668,
      "z": 7319312291.327679
    },
    "rPlanetAbs": {
      "x": -1194286446.047476,
      "y": 1291207937.3599813,
      "z": 7319420855.879292
    },
    "rMoonAbs": {
      "x": -1182429015.0939164,
      "y": 1094905729.785568,
      "z": 7284807480.311289
    }
  },
  {
    "presetId": "default",
    "tSec": 176328.87265,
    "fluxTotal": 1.0000343662871172,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": -5711780965.457609,
      "y": 119524.14557364845,
      "z": -5711751160.437672
    },
    "moonSky": {
      "x": -5848606145.031807,
      "y": -37988072.475366235,
      "z": -5858079003.022612
    },
    "rBary": {
      "x": -8078285017.8,
      "y": 1.7179093903128286e-7,
      "z": 9.742748293031683e-7
    },
    "rPlanetAbs": {
      "x": -8077657031.32293,
      "y": 119524.14557364845,
      "z": 21075.331711704453
    },
    "rMoonAbs": {
      "x": -8277876453.405121,
      "y": -37988072.475366235,
      "z": -6698322.122514726
    }
  },
  {
    "presetId": "kepler-planet-only",
    "tSec": 0,
    "fluxTotal": 1,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": 4865956765.859764,
      "y": 0,
      "z": 4865956765.859764
    },
    "rBary": {
      "x": 6881502052.200001,
      "y": 0,
      "z": 0
    },
    "rPlanetAbs": {
      "x": 6881502052.200001,
      "y": 0,
      "z": 0
    }
  },
  {
    "presetId": "kepler-planet-only",
    "tSec": 88164.436325,
    "fluxTotal": 1,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": -6019997101.682442,
      "y": 1290592237.1921668,
      "z": 4331073607.957256
    },
    "rBary": {
      "x": -1194249255.3183541,
      "y": 1290592237.1921668,
      "z": 7319312291.327679
    },
    "rPlanetAbs": {
      "x": -1194249255.3183541,
      "y": 1290592237.1921668,
      "z": 7319312291.327679
    }
  },
  {
    "presetId": "kepler-planet-only",
    "tSec": 176328.87265,
    "fluxTotal": 1,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": -5712210116.444071,
      "y": 1.7179093903128286e-7,
      "z": -5712210116.444069
    },
    "rBary": {
      "x": -8078285017.8,
      "y": 1.7179093903128286e-7,
      "z": 9.742748293031683e-7
    },
    "rPlanetAbs": {
      "x": -8078285017.8,
      "y": 1.7179093903128286e-7,
      "z": 9.742748293031683e-7
    }
  },
  {
    "presetId": "nbody-with-perturber",
    "tSec": 0,
    "fluxTotal": 1.0000307444149867,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": 4865522070.342241,
      "y": 0,
      "z": 4865522070.342241
    },
    "moonSky": {
      "x": 5004114999.454804,
      "y": 0,
      "z": 5004114999.454804
    },
    "rBary": {
      "x": 6881502052.200001,
      "y": 0,
      "z": 0
    },
    "rPlanetAbs": {
      "x": 6880887299.903617,
      "y": 0,
      "z": 0
    },
    "rMoonAbs": {
      "x": 7076887299.903617,
      "y": 0,
      "z": 0
    },
    "nbodyEnergy": -1.1840791675605802e+27
  },
  {
    "presetId": "nbody-with-perturber",
    "tSec": 88164.436325,
    "fluxTotal": 0.9999910793906553,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": -6020087237.232438,
      "y": 1291001805.2709424,
      "z": 4331032036.520425
    },
    "moonSky": {
      "x": -5880979053.687829,
      "y": 1189436025.0449984,
      "z": 4414691125.318641
    },
    "rBary": {
      "x": -1193848325.3303473,
      "y": 1290683245.0840652,
      "z": 7319223654.438682
    },
    "rPlanetAbs": {
      "x": -1194342386.2218692,
      "y": 1291001805.2709424,
      "z": 7319346631.34142
    },
    "rMoonAbs": {
      "x": -1036822137.321827,
      "y": 1189436025.0449984,
      "z": 7280138200.43559
    },
    "nbodyEnergy": -1.1840790927908614e+27
  },
  {
    "presetId": "nbody-with-perturber",
    "tSec": 176328.87265,
    "fluxTotal": 1.0000343664952538,
    "fluxTransitFactor": 1,
    "planetSky": {
      "x": -5710925600.484008,
      "y": 393584.33820076194,
      "z": -5712171790.409223
    },
    "moonSky": {
      "x": -5653761693.3255005,
      "y": -183407002.4253868,
      "z": -5709567649.870968
    },
    "rBary": {
      "x": -8077217071.630345,
      "y": -182904.60460362,
      "z": -1002193.8671066408
    },
    "rPlanetAbs": {
      "x": -8077349627.254961,
      "y": 393584.33820076194,
      "z": -881189.3467651326
    },
    "rMoonAbs": {
      "x": -8035087235.4303,
      "y": -183407002.4253868,
      "z": -39460770.30390162
    },
    "nbodyEnergy": -1.184079059278045e+27
  }
]
BASELINE_SNAPSHOTS_END

BASELINE_PERF_MS_PER_STEP 0.013345
```
