/** Verifies system state exomoon timing contracts across system state, transit observables, and V4 integration. */

import { expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
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

type BodyState = {
  r: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
};

type PairState = {
  planet: BodyState;
  moon: BodyState;
};

function exomoonTimingParams(
  shape: NonNullable<SystemParams["dynamics"]>["exomoonTimingShape"],
): SystemParams {
  const params = cloneParams(SCENARIO_DEFAULTS);
  params.dynamics = { exomoonTimingShape: { enabled: true, tRef: 0, velDt: 50, ...shape } };
  params.star.m = 5.0e29;
  params.star.r = 1;
  params.planet.m = 2.0e25;
  params.planet.r = 1;
  params.planet.orbit = { a: 10, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 };
  if (!params.moon) throw new Error("expected moon in defaults");
  params.moon.m = 1.0e25;
  params.moon.r = 1;
  params.moon.orbitAroundPlanet = { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 };
  return params;
}

function baryAndMoonRelState(params: SystemParams, tObs: number): { bary: BodyState; moonRel: BodyState } {
  const planetOrbit = resolvePlanetOrbitForKinematics(params, tObs, "planet.orbit");
  const bary = stateFromResolvedElements(
    planetOrbit,
    tObs,
    muFromPeriodAndA(planetOrbit.period, planetOrbit.a),
    "planet.orbit",
  );
  const moonOrbit = resolveMoonOrbitForKinematics(params, tObs, "moon.orbitAroundPlanet");
  if (!moonOrbit) throw new Error("expected moon orbit");
  const moonRel = stateFromResolvedElements(
    moonOrbit,
    tObs,
    muFromPeriodAndA(moonOrbit.period, moonOrbit.a),
    "moon.orbitAroundPlanet",
  );
  return { bary, moonRel };
}

function combinePair(
  params: SystemParams,
  bary: BodyState,
  moonRel: BodyState,
  moonRelVelocity = moonRel.v,
): PairState {
  const totalMass = params.planet.m! + params.moon!.m!;
  const planetFraction = params.planet.m! / totalMass;
  const moonFraction = params.moon!.m! / totalMass;
  return {
    planet: {
      r: {
        x: bary.r.x - moonRel.r.x * moonFraction,
        y: bary.r.y - moonRel.r.y * moonFraction,
        z: bary.r.z - moonRel.r.z * moonFraction,
      },
      v: {
        x: bary.v.x - moonRelVelocity.x * moonFraction,
        y: bary.v.y - moonRelVelocity.y * moonFraction,
        z: bary.v.z - moonRelVelocity.z * moonFraction,
      },
    },
    moon: {
      r: {
        x: bary.r.x + moonRel.r.x * planetFraction,
        y: bary.r.y + moonRel.r.y * planetFraction,
        z: bary.r.z + moonRel.r.z * planetFraction,
      },
      v: {
        x: bary.v.x + moonRelVelocity.x * planetFraction,
        y: bary.v.y + moonRelVelocity.y * planetFraction,
        z: bary.v.z + moonRelVelocity.z * planetFraction,
      },
    },
  };
}

function resolvedPair(params: SystemParams, tObs: number): PairState {
  const observerDir = getObserverDir(params);
  const kin = computeBodyKinematics(params, tObs, observerDir);
  const state = resolveDynamicSystemState({
    system: params,
    tObs,
    observerDir,
    kinAtT: kin,
    velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
  });
  if (!state.moon) throw new Error("expected resolved moon state");
  return { planet: state.planet, moon: state.moon };
}

function applyLinearSkyDrift(pair: PairState, params: SystemParams, tObs: number): PairState {
  const { ey } = buildSkyBasis(getObserverDir(params));
  const yDot = params.dynamics!.exomoonTimingShape!.moonImpactYDot!;
  return {
    planet: pair.planet,
    moon: {
      r: {
        x: pair.moon.r.x + ey.x * tObs * yDot,
        y: pair.moon.r.y + ey.y * tObs * yDot,
        z: pair.moon.r.z + ey.z * tObs * yDot,
      },
      v: {
        x: pair.moon.v.x + ey.x * yDot,
        y: pair.moon.v.y + ey.y * yDot,
        z: pair.moon.v.z + ey.z * yDot,
      },
    },
  };
}

function pairWithNodeVelocity(params: SystemParams, tObs: number): PairState {
  const { bary, moonRel } = baryAndMoonRelState(params, tObs);
  const omegaNodeDot = params.dynamics!.exomoonTimingShape!.moonOmegaDot!;
  const moonRelVelocity = {
    x: moonRel.v.x,
    y: moonRel.v.y + omegaNodeDot * moonRel.r.x,
    z: moonRel.v.z,
  };
  return combinePair(params, bary, moonRel, moonRelVelocity);
}

function expectPairClose(actual: PairState, expected: PairState): void {
  expect(actual.planet.r.x).toBeCloseTo(expected.planet.r.x, 12);
  expect(actual.planet.r.y).toBeCloseTo(expected.planet.r.y, 12);
  expect(actual.planet.v.x).toBeCloseTo(expected.planet.v.x, 12);
  expect(actual.planet.v.y).toBeCloseTo(expected.planet.v.y, 12);
  expect(actual.moon.r.x).toBeCloseTo(expected.moon.r.x, 12);
  expect(actual.moon.r.y).toBeCloseTo(expected.moon.r.y, 12);
  expect(actual.moon.v.x).toBeCloseTo(expected.moon.v.x, 12);
  expect(actual.moon.v.y).toBeCloseTo(expected.moon.v.y, 12);
}

it("uses directly propagated moon state when exomoon timing applies only a linear sky-plane drift", () => {
  const params = exomoonTimingParams({ moonImpactYDot: 0.5 });
  const tObs = 10;
  const { bary, moonRel } = baryAndMoonRelState(params, tObs);
  const expected = applyLinearSkyDrift(combinePair(params, bary, moonRel), params, tObs);
  expectPairClose(resolvedPair(params, tObs), expected);
});

it("uses directly propagated planet and moon states when exomoon timing evolves the moon node", () => {
  const params = exomoonTimingParams({ moonOmegaDot: 0.5 });
  expectPairClose(resolvedPair(params, 0), pairWithNodeVelocity(params, 0));
});
