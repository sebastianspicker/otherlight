import { describe, expect, it } from "vitest";
import { createDefaultSimulationConfigV3, createSimulation } from "../../src/sim/v3";

describe("runtime v3 signals", () => {
  it("emits render signals and physics diagnostics", () => {
    const config = createDefaultSimulationConfigV3();
    const runtime = createSimulation(config);
    const step = runtime.step(1000);

    expect(step.renderSignals).toBeDefined();
    expect(Array.isArray(step.renderSignals.occulterGeometry)).toBe(true);
    expect(Array.isArray(step.renderSignals.eventMarkers)).toBe(true);
    expect(step.renderSignals.visibilityFractions).toBeDefined();
    expect(step.renderSignals.fluxComponents).toBeDefined();

    expect(step.physicsDiagnostics).toBeDefined();
    expect(step.physicsDiagnostics.ltteConvergence).toBeDefined();
    expect(step.physicsDiagnostics.shapiroConvergence).toBeDefined();
    expect(step.physicsDiagnostics.integratorStats).toBeDefined();
    expect(Array.isArray(step.physicsDiagnostics.closeEncounterFlags)).toBe(true);
  });

  it("emits explicit relativity validity flags when the shared timing solve is active", () => {
    const config = createDefaultSimulationConfigV3();
    config.dynamics.physicsFeatures = {
      ...(config.dynamics.physicsFeatures ?? {}),
      observables: true,
    };
    config.timingRelativity = {
      enabled: true,
      ltte: true,
      shapiro: true,
      grPrecession: false,
      c: 299_792_458,
      ltteIters: 8,
      ltteTolSec: 1e-12,
      shapiroMinImpact: 0,
      level: "enhanced",
    };

    const runtime = createSimulation(config);
    const step = runtime.step(1234);

    expect(step.physicsDiagnostics.ltteConvergence.enabled).toBe(true);
    expect(step.physicsDiagnostics.shapiroConvergence.enabled).toBe(true);
    expect(step.physicsDiagnostics.shapiroConvergence.validityFlags).toContain("relative-shapiro-delay");
    expect(step.physicsDiagnostics.shapiroConvergence.validityFlags).toContain(
      "unregularized-shapiro-impact",
    );
    expect(step.physicsDiagnostics.ltteConvergence.validityFlags).not.toContain("weak-ltte-iteration-budget");
  });

  it("surfaces advanced timing diagnostics and clock-mismatch warnings on the V3 runtime path", () => {
    const config = createDefaultSimulationConfigV3();
    config.bodies.observer = {
      ...(config.bodies.observer ?? { dir: { x: 0, y: 0, z: 1 } }),
      timekeeping: {
        enabled: true,
        barycentricOffsetSec: 42,
      },
    };
    config.timingRelativity = {
      enabled: true,
      ltte: false,
      shapiro: false,
      grPrecession: false,
      einsteinDelay: true,
      lightBending: true,
      c: 299_792_458,
      timingRefSec: 0,
    };

    const runtime = createSimulation(config);
    const step = runtime.step(1234);

    expect(step.physicsDiagnostics.advancedTiming?.barycentricClockOffsetSec).toBe(42);
    expect(step.physicsDiagnostics.advancedTiming?.einsteinPlanetSec).toBeGreaterThan(0);
    expect(step.physicsDiagnostics.advancedTiming?.lightBendingPlanetRad).toBeGreaterThan(0);
    expect(step.physicsDiagnostics.closeEncounterFlags).toContain("clock-frame-mismatch");
    expect(step.physicsDiagnostics.closeEncounterFlags).toContain("surrogate-model");
    expect(step.renderSignals.uncertaintyFlags).toContain("clock-frame-mismatch");
  });
});
