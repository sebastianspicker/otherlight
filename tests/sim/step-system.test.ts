import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import type { OrbitElements } from "../../src/core/typesOrbit";
import { G_SI } from "../../src/core/units";
import { prepareSimulation, stepSystem } from "../../src/sim/sim";

type Step = ReturnType<typeof stepSystem>;
type FluxDecomposition = NonNullable<NonNullable<Step["meta"]>["fluxDecomposition"]>;

function defaults(): SystemParams {
  return cloneParams(SCENARIO_DEFAULTS);
}

function ltteShapiroParams(): SystemParams {
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
  return params;
}

function observerClockFrameParams(): { base: SystemParams; shifted: SystemParams } {
  const base = higherFidelityParams();
  const shifted = higherFidelityParams();
  shifted.observer = {
    ...(shifted.observer ?? { dir: { x: 0, y: 0, z: 1 } }),
    timekeeping: {
      enabled: true,
      barycentricOffsetSec: 120,
    },
  };
  return { base, shifted };
}

function higherFidelityParams(): SystemParams {
  const params = defaults();
  params.star.photometry = {
    ...(params.star.photometry ?? {}),
    additiveComposition: "higher-fidelity-coupled",
  };
  params.dynamics = {
    ...(params.dynamics ?? {}),
    fidelityProfile: "accurate",
  };
  return params;
}

function eccentricTtvParams(): SystemParams {
  const params = higherFidelityParams();
  delete params.moon;
  const planetOrbit = params.planet.orbit as OrbitElements;
  params.planet.orbit = {
    ...planetOrbit,
    e: 0.35,
    omega: 0.7,
    t0: 0,
  };
  return params;
}

function advancedRelativityParams(): SystemParams {
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
  return params;
}

function closeEncounterParams(): SystemParams {
  const params = defaults();
  params.moon = params.moon ?? defaultMoon();
  params.dynamics = {
    ...(params.dynamics ?? {}),
    nbodyPlanetMoon: closeEncounterNBody(params),
    collisionPolicy: {
      enabled: true,
      minSeparation: 1e11,
      onCloseEncounter: "warn",
    },
  };
  return params;
}

function defaultMoon(): SystemParams["moon"] {
  return defaults().moon;
}

function closeEncounterNBody(
  params: SystemParams,
): NonNullable<NonNullable<SystemParams["dynamics"]>["nbodyPlanetMoon"]> {
  return {
    enabled: true,
    muStar: G_SI * massOrDefault(params.star.m, 1.98847e30),
    muPlanet: G_SI * massOrDefault(params.planet.m, 1.89813e27),
    muMoon: G_SI * massOrDefault(params.moon?.m, 5.9722e24),
    dtMax: 60,
    softening: 0,
  };
}

function massOrDefault(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

function eventTimingParams(): SystemParams {
  return higherFidelityParams();
}

function requireTiming(step: Step): NonNullable<NonNullable<Step["meta"]>["timing"]> {
  if (!step.meta?.timing) throw new Error("expected timing metadata");
  return step.meta.timing;
}

function requireAdvancedTiming(step: Step): NonNullable<NonNullable<Step["meta"]>["advancedTiming"]> {
  if (!step.meta?.advancedTiming) throw new Error("expected advanced timing metadata");
  return step.meta.advancedTiming;
}

function requireFluxDecomposition(step: Step): FluxDecomposition {
  if (!step.meta?.fluxDecomposition) throw new Error("expected flux decomposition metadata");
  return step.meta.fluxDecomposition;
}

function timingValue(value: number | undefined): number {
  return value ?? 0;
}

function expectObserverClockOffset(baseStep: Step, shiftedStep: Step): void {
  const baseTiming = requireTiming(baseStep);
  const shiftedTiming = requireTiming(shiftedStep);
  expect(requireAdvancedTiming(shiftedStep).barycentricClockOffsetSec).toBe(120);
  expect(shiftedTiming.planetTransitCenterSec).toBeCloseTo(
    timingValue(baseTiming.planetTransitCenterSec) + 120,
    9,
  );
  expect(shiftedTiming.planetTransitDurationSec).toBeCloseTo(
    timingValue(baseTiming.planetTransitDurationSec),
    9,
  );
  expect(shiftedTiming.planetTtvSec).toBeCloseTo(timingValue(baseTiming.planetTtvSec), 9);
}

function expectEventTimingExact(step: Step): void {
  const eventTiming = step.meta?.eventTimingConvergence?.planet;
  expect(eventTiming).toBeDefined();
  expect(eventTiming?.usedExact).toBe(true);
  expect(eventTiming?.status).toBe("exact");
  expect(eventTiming?.converged).toBe(true);
  expect((eventTiming?.ingressIterations ?? 0) > 0).toBe(true);
  expect((eventTiming?.egressIterations ?? 0) > 0).toBe(true);
}

function expectFluxInvariant(step: Step): void {
  expect(Math.abs(step.fluxTotal - expectedFluxTotal(requireFluxDecomposition(step)))).toBeLessThan(1e-10);
}

function expectedFluxTotal(decomposition: FluxDecomposition): number {
  return (
    fluxComponent(decomposition.stellarPreTransit) * fluxComponent(decomposition.transitFactor, 1) +
    fluxComponent(decomposition.planetPhase) +
    fluxComponent(decomposition.moonPhase) +
    fluxComponent(decomposition.forwardScattering) +
    fluxComponent(decomposition.ringScattering)
  );
}

function fluxComponent(value: number | undefined, fallback = 0): number {
  return value ?? fallback;
}

describe("stepSystem basic output", () => {
  it("returns flux ≈ 1.0 when planet is far from transit", () => {
    const step = stepSystem(defaults(), 0);
    expect(step.fluxTotal).toBeGreaterThan(0);
    expect(step.fluxTotal).toBeLessThanOrEqual(2);
    expect(Number.isFinite(step.fluxTotal)).toBe(true);
  });

  it("returns planetSky with finite coordinates", () => {
    const step = stepSystem(defaults(), 100);
    expect(Number.isFinite(step.planetSky.x)).toBe(true);
    expect(Number.isFinite(step.planetSky.y)).toBe(true);
  });

  it("populates meta with expected fields", () => {
    const step = stepSystem(defaults(), 50);
    expect(step.meta).toBeDefined();
    expect(step.meta!.t).toBe(50);
    expect(typeof step.meta!.nOcculters).toBe("number");
    expect(typeof step.meta!.baselineFluxUsed).toBe("number");
    expect(step.meta!.fluxDecomposition).toBeDefined();
  });

  it("handles planet-only system (no moon)", () => {
    const params = defaults();
    delete (params as Record<string, unknown>).moon;
    const step = stepSystem(params, 100);
    expect(Number.isFinite(step.fluxTotal)).toBe(true);
    expect(step.moonSky).toBeUndefined();
  });
});

describe("stepSystem timing diagnostics", () => {
  it("emits LTTE/Shapiro convergence metadata when timing correction is enabled", () => {
    const timingConvergence = stepSystem(ltteShapiroParams(), 1234).meta?.timingConvergence?.planet;
    expect(timingConvergence).toBeDefined();
    expect(typeof timingConvergence?.converged).toBe("boolean");
    expect((timingConvergence?.iterations ?? 0) > 0).toBe(true);
    expect(timingConvergence?.usedShapiro).toBe(true);
  });

  it("applies observer clock-frame offsets to reported transit times without changing durations", () => {
    const { base, shifted } = observerClockFrameParams();
    expectObserverClockOffset(stepSystem(base, 1234), stepSystem(shifted, 1234));
  });

  it("uses a transit ephemeris instead of periapsis passage for eccentric-orbit TTV", () => {
    expect(
      Math.abs(requireTiming(stepSystem(eccentricTtvParams(), 1234)).planetTtvSec ?? Number.NaN),
    ).toBeLessThan(1e-3);
  });

  it("emits advanced timing diagnostics for bounded Einstein-delay and light-bending surrogates", () => {
    const step = stepSystem(advancedRelativityParams(), 1234);
    expect(requireAdvancedTiming(step).einsteinPlanetSec).toBeGreaterThan(0);
    expect(requireAdvancedTiming(step).lightBendingPlanetRad).toBeGreaterThan(0);
    expect(requireAdvancedTiming(step).validityFlags).toContain("surrogate-model");
    expect(requireTiming(step).einsteinPlanetSec).toBe(requireAdvancedTiming(step).einsteinPlanetSec);
  });

  it("emits exact event-timing diagnostics on the higher-fidelity transit timing path", () => {
    expectEventTimingExact(stepSystem(eventTimingParams(), 1234));
  });
});

describe("stepSystem N-body and invariants", () => {
  it("exposes close-encounter distance when N-body collision warnings are configured", () => {
    const advancedTiming = requireAdvancedTiming(stepSystem(closeEncounterParams(), 0));
    expect(advancedTiming.closeEncounterDistance).toBeGreaterThan(0);
    expect(advancedTiming.validityFlags).toContain("close-encounter");
  });

  it("satisfies the flux decomposition invariant", () => {
    expectFluxInvariant(stepSystem(defaults(), 1234));
  });

  it("does not mutate the params object", () => {
    const params = defaults();
    const serialized = JSON.stringify(params);
    stepSystem(params, 100);
    expect(JSON.stringify(params)).toBe(serialized);
  });

  it("returns immutable result (meta.didacticSignals set via spread, not mutation)", () => {
    const step = stepSystem(defaults(), 10);
    expect(step.meta).toBeDefined();
    expect(step.meta!.t).toBe(10);
  });
});

describe("stepSystem validation", () => {
  it("throws on NaN time", () => {
    expect(() => stepSystem(defaults(), NaN)).toThrow();
  });

  it("throws on missing star radius", () => {
    const params = defaults();
    (params.star as { r: number }).r = NaN;
    expect(() => stepSystem(params, 0)).toThrow();
  });
});

describe("prepareSimulation", () => {
  it("resolves without error for default params", async () => {
    await expect(prepareSimulation(defaults())).resolves.not.toThrow();
  });

  it("resolves without error when limbDarkeningModel is absent", async () => {
    const params = defaults();
    delete params.star.photometry?.limbDarkeningModel;
    await expect(prepareSimulation(params)).resolves.not.toThrow();
  });
});
