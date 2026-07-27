/** Verifies system state relativity moon contracts across system state, transit observables, and V4 integration. */

import { expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import { G_SI } from "../../src/core/units";
import { muFromPeriodAndA } from "../../src/physics/kepler";
import { solveLightTimeCorrectedTime } from "../../src/physics/relativity";
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

function relativisticMoonParams(enhanced = false): SystemParams {
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
    relativityLevel: enhanced ? "enhanced" : undefined,
    exomoonTimingShape: {
      enabled: false,
      velDt: 50,
    },
  };
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

function combineBarycentricPair(
  baryState: BodyState,
  moonRelState: BodyState,
  params: SystemParams,
): PairState {
  const totalMass = params.planet.m! + params.moon!.m!;
  const planetFraction = params.planet.m! / totalMass;
  const moonFraction = params.moon!.m! / totalMass;
  return {
    planet: {
      r: {
        x: baryState.r.x - moonRelState.r.x * moonFraction,
        y: baryState.r.y - moonRelState.r.y * moonFraction,
        z: baryState.r.z - moonRelState.r.z * moonFraction,
      },
      v: {
        x: baryState.v.x - moonRelState.v.x * moonFraction,
        y: baryState.v.y - moonRelState.v.y * moonFraction,
        z: baryState.v.z - moonRelState.v.z * moonFraction,
      },
    },
    moon: {
      r: {
        x: baryState.r.x + moonRelState.r.x * planetFraction,
        y: baryState.r.y + moonRelState.r.y * planetFraction,
        z: baryState.r.z + moonRelState.r.z * planetFraction,
      },
      v: {
        x: baryState.v.x + moonRelState.v.x * planetFraction,
        y: baryState.v.y + moonRelState.v.y * planetFraction,
        z: baryState.v.z + moonRelState.v.z * planetFraction,
      },
    },
  };
}

function pairStateAt(params: SystemParams, t: number): PairState {
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
  return combineBarycentricPair(baryState, moonRelState, params);
}

function resolvedDynamicState(params: SystemParams): PairState {
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
  if (!state.moon) throw new Error("expected resolved moon state");
  return { planet: state.planet, moon: state.moon };
}

function starMuFromPlanetOrbit(params: SystemParams): number {
  const orbit = resolvePlanetOrbitForKinematics(params, 0, "planet.orbit");
  return muFromPeriodAndA(orbit.period, orbit.a);
}

function retardedTimeSinglePoint(params: SystemParams, body: keyof PairState): number {
  const observerDir = getObserverDir(params);
  return solveLightTimeCorrectedTime({
    tObs: 0,
    rAtTime: (t) => pairStateAt(params, t)[body].r,
    observerDir,
    c: params.dynamics!.relativity!.c!,
    shapiro: {
      enabled: true,
      mu: starMuFromPlanetOrbit(params),
      minImpact: params.dynamics!.relativity!.shapiroMinImpact,
    },
    maxIters: params.dynamics!.relativity!.ltteIters,
    tolSec: params.dynamics!.relativity!.ltteTolSec,
  });
}

function enhancedShapiroMassesAtTime(params: SystemParams, t: number) {
  const pair = pairStateAt(params, t);
  return [
    { mu: starMuFromPlanetOrbit(params), r: { x: 0, y: 0, z: 0 } },
    { mu: G_SI * params.planet.m!, r: pair.planet.r },
    { mu: G_SI * params.moon!.m!, r: pair.moon.r },
  ];
}

function retardedTimeEnhanced(params: SystemParams, body: keyof PairState): number {
  const observerDir = getObserverDir(params);
  return solveLightTimeCorrectedTime({
    tObs: 0,
    rAtTime: (t) => pairStateAt(params, t)[body].r,
    observerDir,
    c: params.dynamics!.relativity!.c!,
    shapiro: {
      enabled: true,
      minImpact: params.dynamics!.relativity!.shapiroMinImpact,
      massesAtTime: (t) => enhancedShapiroMassesAtTime(params, t),
    },
    maxIters: params.dynamics!.relativity!.ltteIters,
    tolSec: params.dynamics!.relativity!.ltteTolSec,
  });
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

function expectResolvedStateMatchesRetardedPair(
  params: SystemParams,
  retardedTime: (params: SystemParams, body: keyof PairState) => number,
): void {
  const tPlanet = retardedTime(params, "planet");
  const tMoon = retardedTime(params, "moon");
  expectPairClose(resolvedDynamicState(params), {
    planet: pairStateAt(params, tPlanet).planet,
    moon: pairStateAt(params, tMoon).moon,
  });
}

it("uses directly propagated retarded planet and moon states when LTTE and Shapiro are enabled on a moon-bearing orbit", () => {
  expectResolvedStateMatchesRetardedPair(relativisticMoonParams(), retardedTimeSinglePoint);
});

it("uses directly propagated retarded planet and moon states when enhanced LTTE and Shapiro are enabled on a moon-bearing orbit", () => {
  expectResolvedStateMatchesRetardedPair(relativisticMoonParams(true), retardedTimeEnhanced);
});
