import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import { toFiniteNumber } from "../../src/core/units";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stepSystem } from "../../src/sim/sim";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

type ClassicStep = ReturnType<typeof stepSystem>;
type NativeStep = ReturnType<ReturnType<typeof createSimulationV4>["step"]>;

function findPlanetTransitCenterSec(params: SystemParams): number {
  return findTransitCenterSec(params, (kin) => kin.planetSky);
}

function findMoonTransitCenterSec(params: SystemParams): number {
  return findTransitCenterSec(params, (kin) => kin.moonSky);
}

function findTransitCenterSec(
  params: SystemParams,
  skyPointAt: (
    kin: ReturnType<typeof computeBodyKinematics>,
  ) => { x: number; y: number; z: number } | undefined,
): number {
  const observerDir = getObserverDir(params);
  const orbit = params.planet.orbit;
  if (!("period" in orbit)) {
    throw new Error("findTransitCenterSec: planet orbit provider is not supported in this parity helper.");
  }

  const periodSec = orbit.period;
  const samples = 8000;
  let bestSec = 0;
  let bestImpact = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx <= samples; idx++) {
    const tSec = (periodSec * idx) / samples;
    const skyPoint = skyPointAt(computeBodyKinematics(params, tSec, observerDir));
    if (!skyPoint || skyPoint.z <= 0) continue;
    const impact = Math.hypot(skyPoint.x, skyPoint.y);
    if (impact < bestImpact) {
      bestImpact = impact;
      bestSec = tSec;
    }
  }
  return bestSec;
}

function cleanCircularParams(): SystemParams {
  const params = cloneParams(SCENARIO_DEFAULTS);
  delete params.moon;
  params.planet.shape = undefined;
  params.planet.rings = undefined;
  params.star.photometry = {
    ...params.star.photometry,
    limbDarkeningModel: undefined,
    brightnessPatches: undefined,
    atmosphereTransmission: undefined,
    phaseCurve: undefined,
    moonPhaseCurve: undefined,
    forwardScattering: undefined,
    ringScattering: undefined,
  };
  params.planet.orbit = {
    a: 1.2e10,
    e: 0,
    inc: Math.PI / 2,
    Omega: 0,
    omega: 0,
    period: 3.2e5,
    t0: 0,
  };
  return params;
}

function eccentricPlanetTimingParams(): SystemParams {
  return planetTimingParams({
    e: 0.6,
    inc: Math.PI / 2,
    omega: 0.8,
  });
}

function grazingPlanetTimingParams(): SystemParams {
  return planetTimingParams({
    e: 0,
    inc: Math.acos(1.095 / 5),
    omega: 0,
  });
}

function planetTimingParams(orbit: { e: number; inc: number; omega: number }): SystemParams {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    dynamics: { fidelityProfile: "accurate" },
    planet: {
      r: 0.1,
      m: 1e-3,
      orbit: {
        a: 5,
        e: orbit.e,
        inc: orbit.inc,
        Omega: 0,
        omega: orbit.omega,
        period: 1000,
        t0: 0,
      },
    },
  };
}

function moonTimingParams(accelerated = false): SystemParams {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: {
      r: 1,
      m: 1,
      photometry: { baselineFlux: 1, gridRes: 300, additiveComposition: "higher-fidelity-coupled" },
    },
    dynamics: accelerated ? acceleratedTimingDynamics() : { fidelityProfile: "accurate" },
    planet: {
      r: 0.09,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0.2,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0.2,
        period: 1000,
        t0: 0,
      },
    },
    moon: {
      r: 0.03,
      m: 1e-5,
      orbitAroundPlanet: {
        a: 0.55,
        e: 0.05,
        inc: 0.03,
        Omega: 0.15,
        omega: 0.4,
        period: 180,
        t0: 0,
      },
    },
  };
}

function acceleratedTimingDynamics(): NonNullable<SystemParams["dynamics"]> {
  return {
    fidelityProfile: "accurate",
    exomoonTimingShape: {
      enabled: true,
      tRef: 0,
      velDt: 50,
      moonOmegaDot: 5e-4,
    },
  };
}

async function nativeStep(
  params: SystemParams,
  tSec: number,
  scientificBrowser = false,
): Promise<NativeStep> {
  const cfg = migrateSystemParamsToV4(params);
  if (scientificBrowser) {
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
  }
  const runtime = createSimulationV4(cfg);
  await runtime.prepare();
  return runtime.step(tSec);
}

async function paritySteps(
  params: SystemParams,
  tSec: number,
): Promise<{ classic: ClassicStep; native: NativeStep }> {
  return {
    classic: stepSystem(params, tSec),
    native: await nativeStep(params, tSec, true),
  };
}

function classicTiming(step: ClassicStep): NonNullable<NonNullable<ClassicStep["meta"]>["timing"]> {
  if (!step.meta?.timing) throw new Error("expected classic timing metadata");
  return step.meta.timing;
}

function nativeTiming(step: NativeStep): NonNullable<NativeStep["timing"]> {
  if (!step.timing) throw new Error("expected native timing metadata");
  return step.timing;
}

function expectTransitFactorMatches(classic: ClassicStep, native: NativeStep): void {
  expect(native.flux.transitFactor).toBeCloseTo(toFiniteNumber(classic.fluxTransitFactor, 1), 6);
}

function expectPlanetTimingMatches(classic: ClassicStep, native: NativeStep): void {
  const classicTimingData = classicTiming(classic);
  const nativeTimingData = nativeTiming(native);
  expectRequiredTimeClose(
    nativeTimingData.planetTransitCenterSec,
    classicTimingData.planetTransitCenterSec,
    6,
  );
  expectRequiredTimeClose(nativeTimingData.planetIngressSec, classicTimingData.planetIngressSec, 5);
  expectRequiredTimeClose(nativeTimingData.planetEgressSec, classicTimingData.planetEgressSec, 5);
  expectRequiredTimeClose(
    nativeTimingData.planetTransitDurationSec,
    classicTimingData.planetTransitDurationSec,
    5,
  );
}

function expectMoonTimingWithin(classic: ClassicStep, native: NativeStep): void {
  const classicTimingData = classicTiming(classic);
  const nativeTimingData = nativeTiming(native);
  expectDeltaLess(nativeTimingData.moonTransitCenterSec, classicTimingData.moonTransitCenterSec, 1);
  expectDeltaLess(nativeTimingData.moonIngressSec, classicTimingData.moonIngressSec, 1.5);
  expectDeltaLess(nativeTimingData.moonEgressSec, classicTimingData.moonEgressSec, 1.5);
  expectDeltaLess(nativeTimingData.moonTransitDurationSec, classicTimingData.moonTransitDurationSec, 2);
}

function expectDeltaLess(actual: number | undefined, expected: number | undefined, limit: number): void {
  expect(Math.abs((actual ?? 0) - (expected ?? 0))).toBeLessThan(limit);
}

function expectRequiredTimeClose(
  actual: number | undefined,
  expected: number | undefined,
  digits: number,
): void {
  if (actual === undefined) throw new Error("expected native timing value");
  expect(actual).toBeCloseTo(expected ?? 0, digits);
}

function expectPlanetDebugExact(native: NativeStep): void {
  const debug = native.debug?.eventTimingSolvePlanet;
  expect(debug?.status).toBe("exact");
  expect(debug?.converged).toBe(true);
  expect(debug?.usedExact).toBe(true);
}

function expectMoonDebugExact(native: NativeStep): void {
  const debug = native.debug?.eventTimingSolveMoon;
  expect(debug?.status).toBe("exact");
  expect(debug?.converged).toBe(true);
  expect(debug?.usedExact).toBe(true);
}

describe("v4 native parity contract", () => {
  it("matches the classic transit factor for the simple circular clean preset path", async () => {
    const params = cleanCircularParams();
    expectTransitFactorMatches(stepSystem(params, 0), await nativeStep(params, 0));
  });

  it("matches classic exact transit timing diagnostics for an eccentric planet event", async () => {
    const params = eccentricPlanetTimingParams();
    const { classic, native } = await paritySteps(params, findPlanetTransitCenterSec(params));
    expectPlanetTimingMatches(classic, native);
    expectPlanetDebugExact(native);
  });

  it("matches classic exact moon timing diagnostics on the scientific-browser path", async () => {
    const params = moonTimingParams();
    const { classic, native } = await paritySteps(params, findMoonTransitCenterSec(params));
    expectMoonTimingWithin(classic, native);
    expectMoonDebugExact(native);
  });

  it("matches classic exact grazing planet timing diagnostics on the scientific-browser path", async () => {
    const params = grazingPlanetTimingParams();
    const { classic, native } = await paritySteps(params, findPlanetTransitCenterSec(params));
    expectPlanetTimingMatches(classic, native);
    expectPlanetDebugExact(native);
  });

  it("matches classic exact accelerated moon timing diagnostics on the scientific-browser path", async () => {
    const params = moonTimingParams(true);
    const { classic, native } = await paritySteps(params, findMoonTransitCenterSec(params));
    expectMoonTimingWithin(classic, native);
    expectMoonDebugExact(native);
  });
});
