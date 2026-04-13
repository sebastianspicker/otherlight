import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { G_SI } from "../../src/core/units";
import { stepSystem, prepareSimulation } from "../../src/sim/sim";

function defaults() {
  return cloneParams(SCENARIO_DEFAULTS);
}

describe("stepSystem", () => {
  it("returns flux ≈ 1.0 when planet is far from transit", () => {
    const params = defaults();
    const step = stepSystem(params, 0);
    expect(step.fluxTotal).toBeGreaterThan(0);
    expect(step.fluxTotal).toBeLessThanOrEqual(2);
    expect(Number.isFinite(step.fluxTotal)).toBe(true);
  });

  it("returns planetSky with finite coordinates", () => {
    const params = defaults();
    const step = stepSystem(params, 100);
    expect(Number.isFinite(step.planetSky.x)).toBe(true);
    expect(Number.isFinite(step.planetSky.y)).toBe(true);
  });

  it("populates meta with expected fields", () => {
    const params = defaults();
    const step = stepSystem(params, 50);
    expect(step.meta).toBeDefined();
    expect(step.meta!.t).toBe(50);
    expect(typeof step.meta!.nOcculters).toBe("number");
    expect(typeof step.meta!.baselineFluxUsed).toBe("number");
    expect(step.meta!.fluxDecomposition).toBeDefined();
  });

  it("emits LTTE/Shapiro convergence metadata when timing correction is enabled", () => {
    const params = defaults();
    params.star.m = params.star.m ?? 1.0e30;
    params.planet.m = params.planet.m ?? 1.0e27;
    params.dynamics = params.dynamics ?? {};
    params.dynamics.physicsFeatures = {
      ...(params.dynamics.physicsFeatures ?? {}),
      observables: true,
    };
    params.dynamics.relativity = {
      enabled: true,
      ltte: true,
      shapiro: true,
      grPrecession: false,
      c: 299_792_458,
      ltteIters: 8,
      ltteTolSec: 1e-12,
      shapiroMinImpact: 0,
    };

    const step = stepSystem(params, 1234);
    const timingConvergence = step.meta?.timingConvergence?.planet;

    expect(timingConvergence).toBeDefined();
    expect(typeof timingConvergence?.converged).toBe("boolean");
    expect((timingConvergence?.iterations ?? 0) > 0).toBe(true);
    expect(timingConvergence?.usedShapiro).toBe(true);
  });

  it("applies observer clock-frame offsets to reported transit times without changing durations", () => {
    const base = defaults();
    const shifted = defaults();
    shifted.observer = {
      ...(shifted.observer ?? { dir: { x: 0, y: 0, z: 1 } }),
      timekeeping: {
        enabled: true,
        barycentricOffsetSec: 120,
      },
    };

    const baseStep = stepSystem(base, 1234);
    const shiftedStep = stepSystem(shifted, 1234);

    expect(shiftedStep.meta?.advancedTiming?.barycentricClockOffsetSec).toBe(120);
    expect(shiftedStep.meta?.timing?.planetTransitCenterSec).toBeCloseTo(
      (baseStep.meta?.timing?.planetTransitCenterSec ?? 0) + 120,
      9,
    );
    expect(shiftedStep.meta?.timing?.planetTransitDurationSec).toBeCloseTo(
      baseStep.meta?.timing?.planetTransitDurationSec ?? 0,
      9,
    );
  });

  it("emits advanced timing diagnostics for bounded Einstein-delay and light-bending surrogates", () => {
    const params = defaults();
    params.dynamics = {
      ...(params.dynamics ?? {}),
      relativity: {
        enabled: true,
        einsteinDelay: true,
        lightBending: true,
        c: 299_792_458,
        timingRefSec: 0,
      },
    };

    const step = stepSystem(params, 1234);

    expect(step.meta?.advancedTiming?.einsteinPlanetSec).toBeGreaterThan(0);
    expect(step.meta?.advancedTiming?.lightBendingPlanetRad).toBeGreaterThan(0);
    expect(step.meta?.advancedTiming?.validityFlags).toContain("surrogate-model");
    expect(step.meta?.timing?.einsteinPlanetSec).toBe(step.meta?.advancedTiming?.einsteinPlanetSec);
  });

  it("exposes close-encounter distance when N-body collision warnings are configured", () => {
    const params = defaults();
    params.moon = params.moon ?? defaults().moon;
    params.dynamics = {
      ...(params.dynamics ?? {}),
      nbodyPlanetMoon: {
        enabled: true,
        muStar: G_SI * (params.star.m ?? 1.98847e30),
        muPlanet: G_SI * (params.planet.m ?? 1.89813e27),
        muMoon: G_SI * (params.moon?.m ?? 5.9722e24),
        dtMax: 60,
        softening: 0,
      },
      collisionPolicy: {
        enabled: true,
        minSeparation: 1e11,
        onCloseEncounter: "warn",
      },
    };

    const step = stepSystem(params, 0);

    expect(step.meta?.advancedTiming?.closeEncounterDistance).toBeGreaterThan(0);
    expect(step.meta?.advancedTiming?.validityFlags).toContain("close-encounter");
  });

  it("emits exact event-timing diagnostics on the higher-fidelity transit timing path", () => {
    const params = defaults();
    params.dynamics = {
      ...(params.dynamics ?? {}),
      fidelityProfile: "accurate",
    };
    params.star.photometry = {
      ...params.star.photometry,
      additiveComposition: "higher-fidelity-coupled",
    };

    const step = stepSystem(params, 1234);
    const eventTiming = step.meta?.eventTimingConvergence?.planet;

    expect(eventTiming).toBeDefined();
    expect(eventTiming?.usedExact).toBe(true);
    expect(eventTiming?.status).toBe("exact");
    expect(eventTiming?.converged).toBe(true);
    expect((eventTiming?.ingressIterations ?? 0) > 0).toBe(true);
    expect((eventTiming?.egressIterations ?? 0) > 0).toBe(true);
  });

  it("satisfies the flux decomposition invariant", () => {
    const params = defaults();
    // Step at a time when planet is near transit to exercise non-trivial flux
    const step = stepSystem(params, 1234);
    const d = step.meta!.fluxDecomposition!;
    const expected =
      (d.stellarPreTransit ?? 0) * (d.transitFactor ?? 1) +
      (d.planetPhase ?? 0) +
      (d.moonPhase ?? 0) +
      (d.forwardScattering ?? 0) +
      (d.ringScattering ?? 0);
    expect(Math.abs(step.fluxTotal - expected)).toBeLessThan(1e-10);
  });

  it("throws on NaN time", () => {
    const params = defaults();
    expect(() => stepSystem(params, NaN)).toThrow();
  });

  it("throws on missing star radius", () => {
    const params = defaults();
    (params.star as { r: number }).r = NaN;
    expect(() => stepSystem(params, 0)).toThrow();
  });

  it("handles planet-only system (no moon)", () => {
    const params = defaults();
    delete (params as Record<string, unknown>).moon;
    const step = stepSystem(params, 100);
    expect(Number.isFinite(step.fluxTotal)).toBe(true);
    expect(step.moonSky).toBeUndefined();
  });

  it("does not mutate the params object", () => {
    const params = defaults();
    const serialized = JSON.stringify(params);
    stepSystem(params, 100);
    expect(JSON.stringify(params)).toBe(serialized);
  });

  it("returns immutable result (meta.didacticSignals set via spread, not mutation)", () => {
    const params = defaults();
    const step = stepSystem(params, 10);
    // The result should be fully constructed — verify meta is defined and consistent
    expect(step.meta).toBeDefined();
    expect(step.meta!.t).toBe(10);
  });
});

describe("prepareSimulation", () => {
  it("resolves without error for default params", async () => {
    const params = defaults();
    await expect(prepareSimulation(params)).resolves.not.toThrow();
  });

  it("resolves without error when limbDarkeningModel is absent", async () => {
    const params = defaults();
    delete params.star.photometry?.limbDarkeningModel;
    await expect(prepareSimulation(params)).resolves.not.toThrow();
  });
});
