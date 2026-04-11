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
});
