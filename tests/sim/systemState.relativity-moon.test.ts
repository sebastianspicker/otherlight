import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { G_SI } from "../../src/core/units";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stateFromResolvedElements } from "../../src/sim/orbits";
import { solveLightTimeCorrectedTime } from "../../src/physics/relativity";
import { resolveDynamicSystemState } from "../../src/sim/systemState";
import { resolveMoonOrbitForKinematics, resolvePlanetOrbitForKinematics } from "../../src/sim/kinematics";
import { muFromPeriodAndA } from "../../src/physics/kepler";

describe("resolveDynamicSystemState", () => {
  it("uses directly propagated retarded planet and moon states when LTTE and Shapiro are enabled on a moon-bearing orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.observer = { dir: { x: 1, y: 0, z: 0 } };
    params.dynamics = {
      relativity: {
        enabled: true,
        grPrecession: false,
        ltte: true,
        shapiro: true,
        c: 1,
        ltteIters: 8,
        ltteTolSec: 1e-12,
        shapiroMinImpact: 0,
      },
      exomoonTimingShape: {
        enabled: false,
        velDt: 50,
      },
    };
    params.star.m = 5.0e29;
    params.star.r = 1;
    params.planet.m = 2.0e25;
    params.planet.r = 1;
    params.planet.orbit = {
      a: 10,
      e: 0,
      inc: 0,
      Omega: 0,
      omega: 0,
      period: 100,
      t0: 0,
    };
    if (!params.moon) throw new Error("expected moon in defaults");
    params.moon.m = 1.0e25;
    params.moon.r = 1;
    params.moon.orbitAroundPlanet = {
      a: 2,
      e: 0,
      inc: 0,
      Omega: 0,
      omega: 0,
      period: 10,
      t0: 0,
    };

    const pairStateAt = (t: number) => {
      const planetOrbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
      const baryState = stateFromResolvedElements(
        planetOrbit,
        t,
        muFromPeriodAndA(planetOrbit.period, planetOrbit.a),
        "planet.orbit",
      );
      const moonOrbit = resolveMoonOrbitForKinematics(params, t, "moon.orbitAroundPlanet");
      if (!moonOrbit) throw new Error("expected moon orbit");
      const moonRelState = stateFromResolvedElements(
        moonOrbit,
        t,
        muFromPeriodAndA(moonOrbit.period, moonOrbit.a),
        "moon.orbitAroundPlanet",
      );
      const planetMu = params.planet.m! / (params.planet.m! + params.moon!.m!);
      const moonMu = params.moon!.m! / (params.planet.m! + params.moon!.m!);
      return {
        planet: {
          r: {
            x: baryState.r.x - moonRelState.r.x * moonMu,
            y: baryState.r.y - moonRelState.r.y * moonMu,
            z: baryState.r.z - moonRelState.r.z * moonMu,
          },
          v: {
            x: baryState.v.x - moonRelState.v.x * moonMu,
            y: baryState.v.y - moonRelState.v.y * moonMu,
            z: baryState.v.z - moonRelState.v.z * moonMu,
          },
        },
        moon: {
          r: {
            x: baryState.r.x + moonRelState.r.x * planetMu,
            y: baryState.r.y + moonRelState.r.y * planetMu,
            z: baryState.r.z + moonRelState.r.z * planetMu,
          },
          v: {
            x: baryState.v.x + moonRelState.v.x * planetMu,
            y: baryState.v.y + moonRelState.v.y * planetMu,
            z: baryState.v.z + moonRelState.v.z * planetMu,
          },
        },
      };
    };

    const tObs = 0;
    const observerDir = getObserverDir(params);
    const kin = computeBodyKinematics(params, tObs, observerDir);
    const state = resolveDynamicSystemState({
      system: params,
      tObs,
      observerDir,
      kinAtT: kin,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    });

    const muStar = muFromPeriodAndA(params.planet.orbit.period, params.planet.orbit.a);
    const tPlanet = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => pairStateAt(t).planet.r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
      shapiro: {
        enabled: true,
        mu: muStar,
        minImpact: params.dynamics!.relativity!.shapiroMinImpact,
      },
      maxIters: params.dynamics!.relativity!.ltteIters,
      tolSec: params.dynamics!.relativity!.ltteTolSec,
    });
    const tMoon = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => pairStateAt(t).moon.r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
      shapiro: {
        enabled: true,
        mu: muStar,
        minImpact: params.dynamics!.relativity!.shapiroMinImpact,
      },
      maxIters: params.dynamics!.relativity!.ltteIters,
      tolSec: params.dynamics!.relativity!.ltteTolSec,
    });
    const expectedPlanet = pairStateAt(tPlanet).planet;
    const expectedMoon = pairStateAt(tMoon).moon;

    expect(state.planet.r.x).toBeCloseTo(expectedPlanet.r.x, 12);
    expect(state.planet.r.y).toBeCloseTo(expectedPlanet.r.y, 12);
    expect(state.planet.v.x).toBeCloseTo(expectedPlanet.v.x, 12);
    expect(state.planet.v.y).toBeCloseTo(expectedPlanet.v.y, 12);
    expect(state.moon?.r.x).toBeCloseTo(expectedMoon.r.x, 12);
    expect(state.moon?.r.y).toBeCloseTo(expectedMoon.r.y, 12);
    expect(state.moon?.v.x).toBeCloseTo(expectedMoon.v.x, 12);
    expect(state.moon?.v.y).toBeCloseTo(expectedMoon.v.y, 12);
  });

  it("uses directly propagated retarded planet and moon states when enhanced LTTE and Shapiro are enabled on a moon-bearing orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.observer = { dir: { x: 1, y: 0, z: 0 } };
    params.dynamics = {
      relativity: {
        enabled: true,
        grPrecession: false,
        ltte: true,
        shapiro: true,
        c: 1,
        ltteIters: 8,
        ltteTolSec: 1e-12,
        shapiroMinImpact: 0,
      },
      relativityLevel: "enhanced",
      exomoonTimingShape: {
        enabled: false,
        velDt: 50,
      },
    };
    params.star.m = 5.0e29;
    params.star.r = 1;
    params.planet.m = 2.0e25;
    params.planet.r = 1;
    params.planet.orbit = {
      a: 10,
      e: 0,
      inc: 0,
      Omega: 0,
      omega: 0,
      period: 100,
      t0: 0,
    };
    if (!params.moon) throw new Error("expected moon in defaults");
    params.moon.m = 1.0e25;
    params.moon.r = 1;
    params.moon.orbitAroundPlanet = {
      a: 2,
      e: 0,
      inc: 0,
      Omega: 0,
      omega: 0,
      period: 10,
      t0: 0,
    };

    const pairStateAt = (t: number) => {
      const planetOrbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
      const baryState = stateFromResolvedElements(
        planetOrbit,
        t,
        muFromPeriodAndA(planetOrbit.period, planetOrbit.a),
        "planet.orbit",
      );
      const moonOrbit = resolveMoonOrbitForKinematics(params, t, "moon.orbitAroundPlanet");
      if (!moonOrbit) throw new Error("expected moon orbit");
      const moonRelState = stateFromResolvedElements(
        moonOrbit,
        t,
        muFromPeriodAndA(moonOrbit.period, moonOrbit.a),
        "moon.orbitAroundPlanet",
      );
      const planetMu = params.planet.m! / (params.planet.m! + params.moon!.m!);
      const moonMu = params.moon!.m! / (params.planet.m! + params.moon!.m!);
      return {
        planet: {
          r: {
            x: baryState.r.x - moonRelState.r.x * moonMu,
            y: baryState.r.y - moonRelState.r.y * moonMu,
            z: baryState.r.z - moonRelState.r.z * moonMu,
          },
          v: {
            x: baryState.v.x - moonRelState.v.x * moonMu,
            y: baryState.v.y - moonRelState.v.y * moonMu,
            z: baryState.v.z - moonRelState.v.z * moonMu,
          },
        },
        moon: {
          r: {
            x: baryState.r.x + moonRelState.r.x * planetMu,
            y: baryState.r.y + moonRelState.r.y * planetMu,
            z: baryState.r.z + moonRelState.r.z * planetMu,
          },
          v: {
            x: baryState.v.x + moonRelState.v.x * planetMu,
            y: baryState.v.y + moonRelState.v.y * planetMu,
            z: baryState.v.z + moonRelState.v.z * planetMu,
          },
        },
      };
    };

    const tObs = 0;
    const observerDir = getObserverDir(params);
    const kin = computeBodyKinematics(params, tObs, observerDir);
    const state = resolveDynamicSystemState({
      system: params,
      tObs,
      observerDir,
      kinAtT: kin,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    });

    const muStar = muFromPeriodAndA(params.planet.orbit.period, params.planet.orbit.a);
    const tPlanet = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => pairStateAt(t).planet.r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
      shapiro: {
        enabled: true,
        minImpact: params.dynamics!.relativity!.shapiroMinImpact,
        massesAtTime: (t) => [
          { mu: muStar, r: { x: 0, y: 0, z: 0 } },
          { mu: G_SI * params.planet.m!, r: pairStateAt(t).planet.r },
          { mu: G_SI * params.moon!.m!, r: pairStateAt(t).moon.r },
        ],
      },
      maxIters: params.dynamics!.relativity!.ltteIters,
      tolSec: params.dynamics!.relativity!.ltteTolSec,
    });
    const tMoon = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => pairStateAt(t).moon.r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
      shapiro: {
        enabled: true,
        minImpact: params.dynamics!.relativity!.shapiroMinImpact,
        massesAtTime: (t) => [
          { mu: muStar, r: { x: 0, y: 0, z: 0 } },
          { mu: G_SI * params.planet.m!, r: pairStateAt(t).planet.r },
          { mu: G_SI * params.moon!.m!, r: pairStateAt(t).moon.r },
        ],
      },
      maxIters: params.dynamics!.relativity!.ltteIters,
      tolSec: params.dynamics!.relativity!.ltteTolSec,
    });
    const expectedPlanet = pairStateAt(tPlanet).planet;
    const expectedMoon = pairStateAt(tMoon).moon;

    expect(state.planet.r.x).toBeCloseTo(expectedPlanet.r.x, 12);
    expect(state.planet.r.y).toBeCloseTo(expectedPlanet.r.y, 12);
    expect(state.planet.v.x).toBeCloseTo(expectedPlanet.v.x, 12);
    expect(state.planet.v.y).toBeCloseTo(expectedPlanet.v.y, 12);
    expect(state.moon?.r.x).toBeCloseTo(expectedMoon.r.x, 12);
    expect(state.moon?.r.y).toBeCloseTo(expectedMoon.r.y, 12);
    expect(state.moon?.v.x).toBeCloseTo(expectedMoon.v.x, 12);
    expect(state.moon?.v.y).toBeCloseTo(expectedMoon.v.y, 12);
  });
});
