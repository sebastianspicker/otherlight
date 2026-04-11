import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import { toFiniteNumber } from "../../src/core/units";
import { stepSystem } from "../../src/sim/sim";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

function findPlanetTransitCenterSec(params: SystemParams): number {
  const observerDir = getObserverDir(params);
  const orbit = params.planet.orbit;
  if (!("period" in orbit)) {
    throw new Error(
      "findPlanetTransitCenterSec: planet orbit provider is not supported in this parity helper.",
    );
  }
  const periodSec = orbit.period;
  const samples = 8000;
  let bestSec = 0;
  let bestImpact = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx <= samples; idx++) {
    const tSec = (periodSec * idx) / samples;
    const kin = computeBodyKinematics(params, tSec, observerDir);
    if (!(kin.planetSky.z > 0)) continue;
    const impact = Math.hypot(kin.planetSky.x, kin.planetSky.y);
    if (impact < bestImpact) {
      bestImpact = impact;
      bestSec = tSec;
    }
  }

  return bestSec;
}

function findMoonTransitCenterSec(params: SystemParams): number {
  const observerDir = getObserverDir(params);
  const orbit = params.planet.orbit;
  if (!("period" in orbit)) {
    throw new Error(
      "findMoonTransitCenterSec: planet orbit provider is not supported in this parity helper.",
    );
  }
  const periodSec = orbit.period;
  const samples = 8000;
  let bestSec = 0;
  let bestImpact = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx <= samples; idx++) {
    const tSec = (periodSec * idx) / samples;
    const kin = computeBodyKinematics(params, tSec, observerDir);
    if (!kin.moonSky || !(kin.moonSky.z > 0)) continue;
    const impact = Math.hypot(kin.moonSky.x, kin.moonSky.y);
    if (impact < bestImpact) {
      bestImpact = impact;
      bestSec = tSec;
    }
  }

  return bestSec;
}

describe("v4 native parity contract", () => {
  it("matches the classic transit factor for the simple circular clean preset path", async () => {
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

    const cfg = migrateSystemParamsToV4(params);
    const runtime = createSimulationV4(cfg);
    await runtime.prepare();

    const t = 0;
    const classic = stepSystem(params, t);
    const native = runtime.step(t);

    expect(native.flux.transitFactor).toBeCloseTo(toFiniteNumber(classic.fluxTransitFactor, 1), 6);
  });

  it("matches classic exact transit timing diagnostics for an eccentric planet event", async () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
      dynamics: { fidelityProfile: "accurate" },
      planet: {
        r: 0.1,
        m: 1e-3,
        orbit: {
          a: 5,
          e: 0.6,
          inc: Math.PI / 2,
          Omega: 0,
          omega: 0.8,
          period: 1000,
          t0: 0,
        },
      },
    };

    const tSec = findPlanetTransitCenterSec(params);
    const classic = stepSystem(params, tSec);
    const cfg = migrateSystemParamsToV4(params);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    const runtime = createSimulationV4(cfg);
    await runtime.prepare();
    const native = runtime.step(tSec);

    expect(native.timing?.planetTransitCenterSec).toBeCloseTo(
      classic.meta?.timing?.planetTransitCenterSec ?? 0,
      6,
    );
    expect(native.timing?.planetIngressSec).toBeCloseTo(classic.meta?.timing?.planetIngressSec ?? 0, 5);
    expect(native.timing?.planetEgressSec).toBeCloseTo(classic.meta?.timing?.planetEgressSec ?? 0, 5);
    expect(native.timing?.planetTransitDurationSec).toBeCloseTo(
      classic.meta?.timing?.planetTransitDurationSec ?? 0,
      5,
    );
    expect(native.debug?.eventTimingSolvePlanet?.status).toBe("exact");
    expect(native.debug?.eventTimingSolvePlanet?.converged).toBe(true);
    expect(native.debug?.eventTimingSolvePlanet?.usedExact).toBe(true);
  });

  it("matches classic exact moon timing diagnostics on the scientific-browser path", async () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: {
        r: 1,
        m: 1,
        photometry: { baselineFlux: 1, gridRes: 300, additiveComposition: "higher-fidelity-coupled" },
      },
      dynamics: { fidelityProfile: "accurate" },
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

    const tSec = findMoonTransitCenterSec(params);
    const classic = stepSystem(params, tSec);
    const cfg = migrateSystemParamsToV4(params);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    const runtime = createSimulationV4(cfg);
    await runtime.prepare();
    const native = runtime.step(tSec);

    expect(
      Math.abs(
        (native.timing?.moonTransitCenterSec ?? 0) - (classic.meta?.timing?.moonTransitCenterSec ?? 0),
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs((native.timing?.moonIngressSec ?? 0) - (classic.meta?.timing?.moonIngressSec ?? 0)),
    ).toBeLessThan(1.5);
    expect(
      Math.abs((native.timing?.moonEgressSec ?? 0) - (classic.meta?.timing?.moonEgressSec ?? 0)),
    ).toBeLessThan(1.5);
    expect(
      Math.abs(
        (native.timing?.moonTransitDurationSec ?? 0) - (classic.meta?.timing?.moonTransitDurationSec ?? 0),
      ),
    ).toBeLessThan(2);
    expect(native.debug?.eventTimingSolveMoon?.status).toBe("exact");
    expect(native.debug?.eventTimingSolveMoon?.converged).toBe(true);
    expect(native.debug?.eventTimingSolveMoon?.usedExact).toBe(true);
  });

  it("matches classic exact grazing planet timing diagnostics on the scientific-browser path", async () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
      dynamics: { fidelityProfile: "accurate" },
      planet: {
        r: 0.1,
        m: 1e-3,
        orbit: {
          a: 5,
          e: 0,
          inc: Math.acos(1.095 / 5),
          Omega: 0,
          omega: 0,
          period: 1000,
          t0: 0,
        },
      },
    };

    const tSec = findPlanetTransitCenterSec(params);
    const classic = stepSystem(params, tSec);
    const cfg = migrateSystemParamsToV4(params);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    const runtime = createSimulationV4(cfg);
    await runtime.prepare();
    const native = runtime.step(tSec);

    expect(native.timing?.planetTransitCenterSec).toBeCloseTo(
      classic.meta?.timing?.planetTransitCenterSec ?? 0,
      6,
    );
    expect(native.timing?.planetIngressSec).toBeCloseTo(classic.meta?.timing?.planetIngressSec ?? 0, 5);
    expect(native.timing?.planetEgressSec).toBeCloseTo(classic.meta?.timing?.planetEgressSec ?? 0, 5);
    expect(native.timing?.planetTransitDurationSec).toBeCloseTo(
      classic.meta?.timing?.planetTransitDurationSec ?? 0,
      5,
    );
    expect(native.debug?.eventTimingSolvePlanet?.status).toBe("exact");
    expect(native.debug?.eventTimingSolvePlanet?.converged).toBe(true);
    expect(native.debug?.eventTimingSolvePlanet?.usedExact).toBe(true);
  });

  it("matches classic exact accelerated moon timing diagnostics on the scientific-browser path", async () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: {
        r: 1,
        m: 1,
        photometry: { baselineFlux: 1, gridRes: 300, additiveComposition: "higher-fidelity-coupled" },
      },
      dynamics: {
        fidelityProfile: "accurate",
        exomoonTimingShape: {
          enabled: true,
          tRef: 0,
          velDt: 50,
          moonOmegaDot: 5e-4,
        },
      },
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

    const tSec = findMoonTransitCenterSec(params);
    const classic = stepSystem(params, tSec);
    const cfg = migrateSystemParamsToV4(params);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    const runtime = createSimulationV4(cfg);
    await runtime.prepare();
    const native = runtime.step(tSec);

    expect(
      Math.abs(
        (native.timing?.moonTransitCenterSec ?? 0) - (classic.meta?.timing?.moonTransitCenterSec ?? 0),
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs((native.timing?.moonIngressSec ?? 0) - (classic.meta?.timing?.moonIngressSec ?? 0)),
    ).toBeLessThan(1.5);
    expect(
      Math.abs((native.timing?.moonEgressSec ?? 0) - (classic.meta?.timing?.moonEgressSec ?? 0)),
    ).toBeLessThan(1.5);
    expect(
      Math.abs(
        (native.timing?.moonTransitDurationSec ?? 0) - (classic.meta?.timing?.moonTransitDurationSec ?? 0),
      ),
    ).toBeLessThan(2);
    expect(native.debug?.eventTimingSolveMoon?.status).toBe("exact");
    expect(native.debug?.eventTimingSolveMoon?.converged).toBe(true);
    expect(native.debug?.eventTimingSolveMoon?.usedExact).toBe(true);
  });
});
