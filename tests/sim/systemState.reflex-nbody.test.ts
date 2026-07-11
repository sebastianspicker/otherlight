import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import { projectToSky } from "../../src/physics/frames";
import { muFromPeriodAndA } from "../../src/physics/kepler";
import { solveLightTimeCorrectedTime } from "../../src/physics/relativity";
import type { Vec3 } from "../../src/physics/vec3";
import { vSub } from "../../src/physics/vec3";
import { getNBodyStateAt } from "../../src/sim/dynamics";
import {
  computeBodyKinematics,
  resolveMoonOrbitForKinematics,
  resolvePlanetOrbitForKinematics,
} from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stateFromResolvedElements } from "../../src/sim/orbits";
import { resolveDynamicSystemState } from "../../src/sim/systemState";

type BodyState = { r: Vec3; v: Vec3 };
type PairState = { planet: BodyState; moon: BodyState };
type NBodyRelativeState = PairState & { star: BodyState };
type ResolvedDynamicState = ReturnType<typeof resolveDynamicSystemState>;

function moonBearingLtteParams(nbody = false): SystemParams {
  const params = cloneParams(SCENARIO_DEFAULTS);
  params.observer = { dir: { x: 1, y: 0, z: 0 } };
  setCircularMoonBearingSystem(params);
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
      velDt: nbody ? 0.5 : 50,
    },
  };
  if (nbody) {
    params.dynamics.nbodyPlanetMoon = {
      enabled: true,
      dtMax: 0.5,
      muStar: 10,
      muPlanet: 1,
      muMoon: 0.5,
    };
  }
  return params;
}

function setCircularMoonBearingSystem(params: SystemParams): void {
  const moon = requireMoon(params);
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
  moon.m = 1.0e25;
  moon.r = 1;
  moon.orbitAroundPlanet = {
    a: 2,
    e: 0,
    inc: 0,
    Omega: 0,
    omega: 0,
    period: 10,
    t0: 0,
  };
}

function massClosureParams(): SystemParams {
  const params = cloneParams(SCENARIO_DEFAULTS);
  params.star.m = params.star.m ?? 1.0e30;
  params.planet.m = params.planet.m ?? 1.0e27;
  const moon = params.moon;
  if (moon) {
    moon.m = moon.m ?? 1.0e23;
  }
  return params;
}

function integratedNbodyReflexParams(): SystemParams {
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
  const moon = params.moon;
  if (moon) {
    delete moon.m;
  }
  return params;
}

function requireMoon(params: SystemParams): NonNullable<SystemParams["moon"]> {
  if (!params.moon) throw new Error("expected moon in defaults");
  return params.moon;
}

function requireNumber(value: number | undefined, label: string): number {
  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`expected numeric ${label}`);
  }
  return value;
}

function dynamicStateAt(
  params: SystemParams,
  tObs: number,
): {
  observerDir: Vec3;
  state: ResolvedDynamicState;
  kinAtT: ReturnType<typeof computeBodyKinematics>;
} {
  const observerDir = getObserverDir(params);
  const kinAtT = computeBodyKinematics(params, tObs, observerDir);
  return {
    observerDir,
    kinAtT,
    state: resolveDynamicSystemState({
      system: params,
      tObs,
      observerDir,
      kinAtT,
      velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
    }),
  };
}

function baryStateAt(params: SystemParams, t: number): BodyState {
  const orbit = resolvePlanetOrbitForKinematics(params, t, "planet.orbit");
  return stateFromResolvedElements(orbit, t, muFromPeriodAndA(orbit.period, orbit.a), "planet.orbit");
}

function moonRelativeStateAt(params: SystemParams, t: number): BodyState {
  const orbit = resolveMoonOrbitForKinematics(params, t, "moon.orbitAroundPlanet");
  if (!orbit) throw new Error("expected moon orbit");
  return stateFromResolvedElements(
    orbit,
    t,
    muFromPeriodAndA(orbit.period, orbit.a),
    "moon.orbitAroundPlanet",
  );
}

function pairStateAt(params: SystemParams, t: number): PairState {
  return combineBarycentricPair(
    baryStateAt(params, t),
    moonRelativeStateAt(params, t),
    requireNumber(params.planet.m, "planet mass"),
    requireNumber(requireMoon(params).m, "moon mass"),
  );
}

function combineBarycentricPair(
  baryState: BodyState,
  moonRelativeState: BodyState,
  planetMass: number,
  moonMass: number,
): PairState {
  const totalMass = planetMass + moonMass;
  return {
    planet: offsetState(baryState, moonRelativeState, -moonMass / totalMass),
    moon: offsetState(baryState, moonRelativeState, planetMass / totalMass),
  };
}

function offsetState(base: BodyState, offset: BodyState, scale: number): BodyState {
  return {
    r: offsetVec(base.r, offset.r, scale),
    v: offsetVec(base.v, offset.v, scale),
  };
}

function offsetVec(base: Vec3, offset: Vec3, scale: number): Vec3 {
  return {
    x: base.x + offset.x * scale,
    y: base.y + offset.y * scale,
    z: base.z + offset.z * scale,
  };
}

function retardedTimeFor(
  params: SystemParams,
  tObs: number,
  observerDir: Vec3,
  rAtTime: (t: number) => Vec3,
): number {
  const relativity = params.dynamics?.relativity;
  if (!relativity) throw new Error("expected relativity config");
  return solveLightTimeCorrectedTime({
    tObs,
    rAtTime,
    observerDir,
    c: requireNumber(relativity.c, "relativity.c"),
    maxIters: relativity.ltteIters,
    tolSec: relativity.ltteTolSec,
  });
}

function retardedPairState(params: SystemParams, tObs: number, observerDir: Vec3): PairState {
  const tPlanet = retardedTimeFor(params, tObs, observerDir, (t) => pairStateAt(params, t).planet.r);
  const tMoon = retardedTimeFor(params, tObs, observerDir, (t) => pairStateAt(params, t).moon.r);
  return {
    planet: pairStateAt(params, tPlanet).planet,
    moon: pairStateAt(params, tMoon).moon,
  };
}

function nbodyRelativeStateAt(params: SystemParams, time: number): NBodyRelativeState {
  const sample = getNBodyStateAt(params, time);
  if (!sample) throw new Error("expected N-body state");
  return {
    planet: {
      r: vSub(sample.state.rP, sample.state.rS),
      v: vSub(sample.state.vP, sample.state.vS),
    },
    moon: {
      r: vSub(sample.state.rM, sample.state.rS),
      v: vSub(sample.state.vM, sample.state.vS),
    },
    star: {
      r: sample.state.rS,
      v: sample.state.vS,
    },
  };
}

function retardedNbodyState(params: SystemParams, tObs: number, observerDir: Vec3): NBodyRelativeState {
  const tPlanet = retardedTimeFor(params, tObs, observerDir, (t) => nbodyRelativeStateAt(params, t).planet.r);
  const tMoon = retardedTimeFor(params, tObs, observerDir, (t) => nbodyRelativeStateAt(params, t).moon.r);
  const tStar = retardedTimeFor(params, tObs, observerDir, (t) => nbodyRelativeStateAt(params, t).star.r);
  return {
    planet: nbodyRelativeStateAt(params, tPlanet).planet,
    moon: nbodyRelativeStateAt(params, tMoon).moon,
    star: nbodyRelativeStateAt(params, tStar).star,
  };
}

function expectVecClose(actual: Vec3, expected: Vec3, digits = 12): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function expectBodyStateClose(actual: BodyState, expected: BodyState): void {
  expectVecClose(actual.r, expected.r);
  expectVecClose(actual.v, expected.v);
}

function expectResolvedPairClose(state: ResolvedDynamicState, expected: PairState): void {
  if (!state.moon) throw new Error("expected moon state");
  expectBodyStateClose(state.planet, expected.planet);
  expectBodyStateClose(state.moon, expected.moon);
}

function moonMassOrZero(params: SystemParams): number {
  return params.moon ? requireNumber(params.moon.m, "moon mass") : 0;
}

function moonPositionOrZero(state: ResolvedDynamicState): Vec3 {
  return state.moon?.r ?? { x: 0, y: 0, z: 0 };
}

function expectMassClosureReflex(state: ResolvedDynamicState, params: SystemParams): void {
  const starMass = requireNumber(params.star.m, "star mass");
  const planetMass = requireNumber(params.planet.m, "planet mass");
  const moonMass = moonMassOrZero(params);
  const moonR = moonPositionOrZero(state);
  expect(state.star.r.x).toBeCloseTo(-(planetMass * state.planet.r.x + moonMass * moonR.x) / starMass, 8);
  expect(state.star.r.y).toBeCloseTo(-(planetMass * state.planet.r.y + moonMass * moonR.y) / starMass, 8);
  expect(state.star.r.z).toBeCloseTo(-(planetMass * state.planet.r.z + moonMass * moonR.z) / starMass, 8);
}

function expectFiniteVelocity(state: ResolvedDynamicState): void {
  expect(Number.isFinite(state.planet.v.x)).toBe(true);
  expect(Number.isFinite(state.star.v.x)).toBe(true);
}

function expectFiniteStarVector(state: ResolvedDynamicState): void {
  expect(Number.isFinite(state.star.v.x)).toBe(true);
  expect(Number.isFinite(state.star.v.y)).toBe(true);
  expect(Number.isFinite(state.star.v.z)).toBe(true);
  expect(Math.hypot(state.star.v.x, state.star.v.y, state.star.v.z)).toBeGreaterThan(1e-12);
}

function expectProjectedSkyState(
  state: ResolvedDynamicState,
  expected: NBodyRelativeState,
  observerDir: Vec3,
): void {
  if (!state.moon) throw new Error("expected moon state");
  expect(state.planet.sky).toEqual(projectToSky(expected.planet.r, observerDir));
  expect(state.moon.sky).toEqual(projectToSky(expected.moon.r, observerDir));
  expect(state.star.sky).toEqual(projectToSky(expected.star.r, observerDir));
}

function expectResolvedNbodyClose(state: ResolvedDynamicState, expected: NBodyRelativeState): void {
  if (!state.moon) throw new Error("expected moon state");
  expectBodyStateClose(state.planet, expected.planet);
  expectBodyStateClose(state.moon, expected.moon);
  expectBodyStateClose(state.star, expected.star);
}

describe("resolveDynamicSystemState LTTE", () => {
  it("uses directly propagated retarded planet and moon states when LTTE is enabled on a moon-bearing orbit", () => {
    const params = moonBearingLtteParams();
    const { observerDir, state } = dynamicStateAt(params, 0);
    expectResolvedPairClose(state, retardedPairState(params, 0, observerDir));
  });

  it("keeps N-body LTTE positions on the same retarded time surface as projected sky coordinates", () => {
    const params = moonBearingLtteParams(true);
    const { observerDir, state, kinAtT } = dynamicStateAt(params, 0);
    const expected = retardedNbodyState(params, 0, observerDir);
    const observed = nbodyRelativeStateAt(params, 0);

    expectResolvedNbodyClose(state, expected);
    expectProjectedSkyState(state, expected, observerDir);
    expect(Math.abs(state.planet.r.x - observed.planet.r.x)).toBeGreaterThan(1e-3);
    expect(state.planet.r.x).toBeCloseTo(kinAtT.rPlanetAbs.x, 12);
  });
});

describe("resolveDynamicSystemState star reflex", () => {
  it("derives the non-N-body star reflex state from the same mass-closure model as the sampled planet/moon state", () => {
    const params = massClosureParams();
    const { state, kinAtT } = dynamicStateAt(params, 12_345);

    expect(state.planet.r).toEqual(kinAtT.rPlanetAbs);
    expect(state.moon?.r).toEqual(kinAtT.rMoonAbs);
    expectMassClosureReflex(state, params);
    expectFiniteVelocity(state);
  });

  it("uses the integrated N-body star state instead of mass-closure reflex reconstruction when N-body is enabled", () => {
    expectFiniteStarVector(dynamicStateAt(integratedNbodyReflexParams(), 54_321).state);
  });
});
