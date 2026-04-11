import { describe, expect, it } from "vitest";
import {
  createDefaultSimulationConfigV3,
  createSimulation,
  sampleRangeSeconds,
  validateSimulationConfigV3,
} from "../../src/sim/v3";

describe("simulation runtime v3", () => {
  it("creates runtime and emits structured step payload", () => {
    const config = createDefaultSimulationConfigV3();
    const runtime = createSimulation(config);
    const step = runtime.step(0);

    expect(step.tObsSec).toBe(0);
    expect(Number.isFinite(step.flux.total)).toBe(true);
    expect(step.kinematics.planetSky).toBeDefined();
    expect(step.debug).toBeDefined();
    expect(step.observables).toBeDefined();
    expect("legacyStep" in step).toBe(false);
  });

  it("samples a deterministic time range", () => {
    const config = createDefaultSimulationConfigV3();
    const runtime = createSimulation(config);

    const series = runtime.sample(sampleRangeSeconds(0, 10, 2));

    expect(series.steps).toHaveLength(6);
    expect(series.range.startSec).toBe(0);
    expect(series.range.endSec).toBe(10);
    expect(series.range.stepSec).toBe(2);
  });

  it("fails fast for invalid config", () => {
    const config = createDefaultSimulationConfigV3();
    config.bodies.star.r = -1;

    expect(() => createSimulation(config)).toThrow(/SimulationConfigV3 validation failed/i);

    const report = validateSimulationConfigV3(config);
    expect(report.ok).toBe(false);
    expect(report.issues.some((x) => x.path === "bodies.star.r")).toBe(true);
  });
});
