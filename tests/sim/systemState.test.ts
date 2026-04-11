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
import { buildSkyBasis } from "../../src/physics/frames";

describe("resolveDynamicSystemState", () => {
  it("uses a directly propagated Kepler velocity on the clean non-N-body path", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.moon = undefined;
    params.dynamics = {};
    params.star.m = 5.0e29;
    params.star.r = 1;
    params.planet.m = 1.0e25;
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

    expect(state.planet.r.x).toBeCloseTo(10, 12);
    expect(state.planet.r.y).toBeCloseTo(0, 12);
    expect(state.planet.v.x).toBeCloseTo(0, 12);
    expect(state.planet.v.y).toBeCloseTo((2 * Math.PI * 10) / 100, 12);
  });

  it("keeps a propagated Kepler velocity when secular mode is enabled on an otherwise simple orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.moon = undefined;
    params.dynamics = {
      secular: {
        enabled: true,
        j2Precession: false,
        tides: false,
        tRef: 0,
      },
      exomoonTimingShape: {
        enabled: false,
        velDt: 50,
      },
    };
    params.star.m = 5.0e29;
    params.star.r = 1;
    params.planet.m = 1.0e25;
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

    expect(state.planet.v.x).toBeCloseTo(0, 12);
    expect(state.planet.v.y).toBeCloseTo((2 * Math.PI * 10) / 100, 12);
  });

  it("keeps a propagated Kepler velocity when GR precession is enabled on a planet-only orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.moon = undefined;
    params.dynamics = {
      relativity: {
        enabled: true,
        grPrecession: true,
        ltte: false,
        shapiro: false,
        c: 299_792_458,
        planetPrecessionPerOrbit: 0,
      },
      exomoonTimingShape: {
        enabled: false,
        velDt: 50,
      },
    };
    params.star.m = 5.0e29;
    params.star.r = 1;
    params.planet.m = 1.0e25;
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

    expect(state.planet.v.x).toBeCloseTo(0, 12);
    expect(state.planet.v.y).toBeCloseTo((2 * Math.PI * 10) / 100, 12);
  });

  it("keeps propagated planet and moon velocities when GR precession is enabled on a moon-bearing orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = {
      relativity: {
        enabled: true,
        grPrecession: true,
        ltte: false,
        shapiro: false,
        c: 299_792_458,
        planetPrecessionPerOrbit: 0,
        moonPrecessionPerOrbit: 0,
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

    expect(state.planet.v.x).toBeCloseTo(0, 12);
    expect(state.moon?.v.x).toBeCloseTo(0, 12);
    expect(state.planet.v.y).toBeCloseTo((2 * Math.PI * 10) / 100 - (2 * Math.PI * 2) / 10 / 3, 12);
    expect(state.moon?.v.y).toBeCloseTo((2 * Math.PI * 10) / 100 + (((2 * Math.PI * 2) / 10) * 2) / 3, 12);
  });

  it("uses a directly propagated retarded planet state when LTTE is enabled on a planet-only orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.moon = undefined;
    params.observer = { dir: { x: 1, y: 0, z: 0 } };
    params.dynamics = {
      relativity: {
        enabled: true,
        grPrecession: false,
        ltte: true,
        shapiro: false,
        c: 1,
        ltteIters: 8,
        ltteTolSec: 1e-12,
      },
      exomoonTimingShape: {
        enabled: false,
        velDt: 50,
      },
    };
    params.star.m = 5.0e29;
    params.star.r = 1;
    params.planet.m = 1.0e25;
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

    const planetStateAt = (t: number) => {
      const orbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
      return stateFromResolvedElements(orbit, t, muFromPeriodAndA(orbit.period, orbit.a), "planet.orbit");
    };

    const tPlanet = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => planetStateAt(t).r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
      maxIters: params.dynamics!.relativity!.ltteIters,
      tolSec: params.dynamics!.relativity!.ltteTolSec,
    });
    const expected = planetStateAt(tPlanet);

    expect(state.planet.r.x).toBeCloseTo(expected.r.x, 12);
    expect(state.planet.r.y).toBeCloseTo(expected.r.y, 12);
    expect(state.planet.v.x).toBeCloseTo(expected.v.x, 12);
    expect(state.planet.v.y).toBeCloseTo(expected.v.y, 12);
  });

  it("uses a directly propagated retarded planet state when LTTE and Shapiro are enabled on a planet-only orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.moon = undefined;
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
    params.planet.m = 1.0e25;
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

    const planetStateAt = (t: number) => {
      const orbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
      return stateFromResolvedElements(orbit, t, muFromPeriodAndA(orbit.period, orbit.a), "planet.orbit");
    };
    const muStar = muFromPeriodAndA(params.planet.orbit.period, params.planet.orbit.a);

    const tPlanet = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => planetStateAt(t).r,
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
    const expected = planetStateAt(tPlanet);

    expect(state.planet.r.x).toBeCloseTo(expected.r.x, 12);
    expect(state.planet.r.y).toBeCloseTo(expected.r.y, 12);
    expect(state.planet.v.x).toBeCloseTo(expected.v.x, 12);
    expect(state.planet.v.y).toBeCloseTo(expected.v.y, 12);
  });

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

  it("uses directly propagated moon state when exomoon timing applies only a linear sky-plane drift", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = {
      exomoonTimingShape: {
        enabled: true,
        tRef: 0,
        velDt: 50,
        moonImpactYDot: 0.5,
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

    const tObs = 10;
    const observerDir = getObserverDir(params);
    const kin = computeBodyKinematics(params, tObs, observerDir);
    const state = resolveDynamicSystemState({
      system: params,
      tObs,
      observerDir,
      kinAtT: kin,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    });

    const planetOrbit = resolvePlanetOrbitForKinematics(params, tObs, "planet.orbit");
    const baryState = stateFromResolvedElements(
      planetOrbit,
      tObs,
      muFromPeriodAndA(planetOrbit.period, planetOrbit.a),
      "planet.orbit",
    );
    const moonOrbit = resolveMoonOrbitForKinematics(params, tObs, "moon.orbitAroundPlanet");
    if (!moonOrbit) throw new Error("expected moon orbit");
    const moonRelState = stateFromResolvedElements(
      moonOrbit,
      tObs,
      muFromPeriodAndA(moonOrbit.period, moonOrbit.a),
      "moon.orbitAroundPlanet",
    );
    const planetMu = params.planet.m! / (params.planet.m! + params.moon!.m!);
    const moonMu = params.moon!.m! / (params.planet.m! + params.moon!.m!);
    const baseMoonState = {
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
    };
    const { ey } = buildSkyBasis(observerDir);
    const expectedMoon = {
      r: {
        x: baseMoonState.r.x + ey.x * (tObs * params.dynamics.exomoonTimingShape!.moonImpactYDot!),
        y: baseMoonState.r.y + ey.y * (tObs * params.dynamics.exomoonTimingShape!.moonImpactYDot!),
        z: baseMoonState.r.z + ey.z * (tObs * params.dynamics.exomoonTimingShape!.moonImpactYDot!),
      },
      v: {
        x: baseMoonState.v.x + ey.x * params.dynamics.exomoonTimingShape!.moonImpactYDot!,
        y: baseMoonState.v.y + ey.y * params.dynamics.exomoonTimingShape!.moonImpactYDot!,
        z: baseMoonState.v.z + ey.z * params.dynamics.exomoonTimingShape!.moonImpactYDot!,
      },
    };

    expect(state.planet.r.x).toBeCloseTo(baryState.r.x - moonRelState.r.x * moonMu, 12);
    expect(state.planet.r.y).toBeCloseTo(baryState.r.y - moonRelState.r.y * moonMu, 12);
    expect(state.planet.v.x).toBeCloseTo(baryState.v.x - moonRelState.v.x * moonMu, 12);
    expect(state.planet.v.y).toBeCloseTo(baryState.v.y - moonRelState.v.y * moonMu, 12);
    expect(state.moon?.r.x).toBeCloseTo(expectedMoon.r.x, 12);
    expect(state.moon?.r.y).toBeCloseTo(expectedMoon.r.y, 12);
    expect(state.moon?.v.x).toBeCloseTo(expectedMoon.v.x, 12);
    expect(state.moon?.v.y).toBeCloseTo(expectedMoon.v.y, 12);
  });

  it("uses directly propagated planet and moon states when exomoon timing evolves the moon node", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = {
      exomoonTimingShape: {
        enabled: true,
        tRef: 0,
        velDt: 50,
        moonOmegaDot: 0.5,
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

    const planetOrbit = resolvePlanetOrbitForKinematics(params, tObs, "planet.orbit");
    const baryState = stateFromResolvedElements(
      planetOrbit,
      tObs,
      muFromPeriodAndA(planetOrbit.period, planetOrbit.a),
      "planet.orbit",
    );
    const moonOrbit = resolveMoonOrbitForKinematics(params, tObs, "moon.orbitAroundPlanet");
    if (!moonOrbit) throw new Error("expected moon orbit");
    const moonRelState = stateFromResolvedElements(
      moonOrbit,
      tObs,
      muFromPeriodAndA(moonOrbit.period, moonOrbit.a),
      "moon.orbitAroundPlanet",
    );
    const omegaNodeDot = params.dynamics.exomoonTimingShape!.moonOmegaDot!;
    const moonRelVelocity = {
      x: moonRelState.v.x,
      y: moonRelState.v.y + omegaNodeDot * moonRelState.r.x,
      z: moonRelState.v.z,
    };
    const planetMu = params.planet.m! / (params.planet.m! + params.moon!.m!);
    const moonMu = params.moon!.m! / (params.planet.m! + params.moon!.m!);
    const expectedPlanet = {
      r: {
        x: baryState.r.x - moonRelState.r.x * moonMu,
        y: baryState.r.y - moonRelState.r.y * moonMu,
        z: baryState.r.z - moonRelState.r.z * moonMu,
      },
      v: {
        x: baryState.v.x - moonRelVelocity.x * moonMu,
        y: baryState.v.y - moonRelVelocity.y * moonMu,
        z: baryState.v.z - moonRelVelocity.z * moonMu,
      },
    };
    const expectedMoon = {
      r: {
        x: baryState.r.x + moonRelState.r.x * planetMu,
        y: baryState.r.y + moonRelState.r.y * planetMu,
        z: baryState.r.z + moonRelState.r.z * planetMu,
      },
      v: {
        x: baryState.v.x + moonRelVelocity.x * planetMu,
        y: baryState.v.y + moonRelVelocity.y * planetMu,
        z: baryState.v.z + moonRelVelocity.z * planetMu,
      },
    };

    expect(state.planet.r.x).toBeCloseTo(expectedPlanet.r.x, 12);
    expect(state.planet.r.y).toBeCloseTo(expectedPlanet.r.y, 12);
    expect(state.planet.v.x).toBeCloseTo(expectedPlanet.v.x, 12);
    expect(state.planet.v.y).toBeCloseTo(expectedPlanet.v.y, 12);
    expect(state.moon?.r.x).toBeCloseTo(expectedMoon.r.x, 12);
    expect(state.moon?.r.y).toBeCloseTo(expectedMoon.r.y, 12);
    expect(state.moon?.v.x).toBeCloseTo(expectedMoon.v.x, 12);
    expect(state.moon?.v.y).toBeCloseTo(expectedMoon.v.y, 12);
  });

  it("uses directly propagated retarded planet and moon states when LTTE is enabled on a moon-bearing orbit", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.observer = { dir: { x: 1, y: 0, z: 0 } };
    params.dynamics = {
      relativity: {
        enabled: true,
        grPrecession: false,
        ltte: true,
        shapiro: false,
        c: 1,
        ltteIters: 8,
        ltteTolSec: 1e-12,
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
      const moonOrbit = params.moon
        ? resolveMoonOrbitForKinematics(params, t, "moon.orbitAroundPlanet")
        : undefined;
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

    const tPlanet = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => pairStateAt(t).planet.r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
      maxIters: params.dynamics!.relativity!.ltteIters,
      tolSec: params.dynamics!.relativity!.ltteTolSec,
    });
    const tMoon = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: (t) => pairStateAt(t).moon.r,
      observerDir,
      c: params.dynamics!.relativity!.c!,
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

  it("derives the non-N-body star reflex state from the same mass-closure model as the sampled planet/moon state", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.star.m = params.star.m ?? 1.0e30;
    params.planet.m = params.planet.m ?? 1.0e27;
    if (params.moon) {
      params.moon.m = params.moon.m ?? 1.0e23;
    }

    const tObs = 12_345;
    const observerDir = getObserverDir(params);
    const kin = computeBodyKinematics(params, tObs, observerDir);
    const state = resolveDynamicSystemState({
      system: params,
      tObs,
      observerDir,
      kinAtT: kin,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    });

    const mS = params.star.m as number;
    const mP = params.planet.m as number;
    const mM = params.moon?.m ?? 0;

    expect(state.planet.r).toEqual(kin.rPlanetAbs);
    expect(state.moon?.r).toEqual(kin.rMoonAbs);
    expect(state.star.r.x).toBeCloseTo(-(mP * state.planet.r.x + mM * (state.moon?.r.x ?? 0)) / mS, 8);
    expect(state.star.r.y).toBeCloseTo(-(mP * state.planet.r.y + mM * (state.moon?.r.y ?? 0)) / mS, 8);
    expect(state.star.r.z).toBeCloseTo(-(mP * state.planet.r.z + mM * (state.moon?.r.z ?? 0)) / mS, 8);
    expect(Number.isFinite(state.planet.v.x)).toBe(true);
    expect(Number.isFinite(state.star.v.x)).toBe(true);
  });

  it("uses the integrated N-body star state instead of mass-closure reflex reconstruction when N-body is enabled", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.dynamics = params.dynamics ?? {};
    params.dynamics.nbodyPlanetMoon = {
      ...(params.dynamics.nbodyPlanetMoon ?? {}),
      enabled: true,
      dtMax: 30,
      perturbers: [
        {
          enabled: true,
          mu: 2.0e16,
          orbit: {
            a: 1.8e10,
            e: 0.05,
            inc: 0.1,
            Omega: 0.2,
            omega: 0.1,
            period: 2.3e6,
            t0: 0,
          },
        },
      ],
    };

    delete params.star.m;
    delete params.planet.m;
    if (params.moon) delete params.moon.m;

    const tObs = 54_321;
    const observerDir = getObserverDir(params);
    const kin = computeBodyKinematics(params, tObs, observerDir);
    const state = resolveDynamicSystemState({
      system: params,
      tObs,
      observerDir,
      kinAtT: kin,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    });

    expect(Number.isFinite(state.star.v.x)).toBe(true);
    expect(Number.isFinite(state.star.v.y)).toBe(true);
    expect(Number.isFinite(state.star.v.z)).toBe(true);
    expect(Math.hypot(state.star.v.x, state.star.v.y, state.star.v.z)).toBeGreaterThan(1e-12);
  });
});
