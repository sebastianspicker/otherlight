import { describe, expect, it } from "vitest";
import { createDefaultSimulationConfigV3, createSimulation } from "../../src/sim/v3";

describe("runtime v3 signals", () => {
  it("emits render signals and physics diagnostics", () => {
    const config = createDefaultSimulationConfigV3();
    const runtime = createSimulation(config);
    const step = runtime.step(0);

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
});
