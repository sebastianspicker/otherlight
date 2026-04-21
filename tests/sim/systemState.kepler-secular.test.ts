import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stateFromResolvedElements } from "../../src/sim/orbits";
import { solveLightTimeCorrectedTime } from "../../src/physics/relativity";
import { resolveDynamicSystemState } from "../../src/sim/systemState";
import { resolvePlanetOrbitForKinematics } from "../../src/sim/kinematics";
import { muFromPeriodAndA } from "../../src/physics/kepler";

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
