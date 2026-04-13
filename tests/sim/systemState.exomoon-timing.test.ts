import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { buildSkyBasis } from "../../src/physics/frames";
import { muFromPeriodAndA } from "../../src/physics/kepler";
import {
  computeBodyKinematics,
  resolveMoonOrbitForKinematics,
  resolvePlanetOrbitForKinematics,
} from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stateFromResolvedElements } from "../../src/sim/orbits";
import { resolveDynamicSystemState } from "../../src/sim/systemState";

describe("resolveDynamicSystemState exomoon timing shape", () => {
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
});
