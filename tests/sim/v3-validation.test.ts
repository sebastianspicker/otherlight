import { describe, expect, it } from "vitest";
import {
  validateSimulationConfigV3,
  assertValidSimulationConfigV3,
  assertValidTimeRange,
} from "../../src/sim/v3/validation";
import type { SimulationConfigV3 } from "../../src/sim/v3/types";

function validOrbit() {
  return { a: 1e11, e: 0.01, inc: 1.5, Omega: 0, omega: 0, period: 3e6, t0: 0 };
}

function validConfig(): SimulationConfigV3 {
  return {
    version: "3",
    bodies: {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 7e8, m: 2e30 },
      planet: { r: 7e7, m: 1.9e27, orbit: validOrbit() },
    },
    dynamics: {},
  };
}

describe("validateSimulationConfigV3", () => {
  it("accepts a valid configuration with no issues", () => {
    const report = validateSimulationConfigV3(validConfig());
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("reports missing star as required", () => {
    const cfg = validConfig();

    delete (cfg.bodies as any).star;
    const report = validateSimulationConfigV3(cfg);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.path === "bodies.star" && /required/i.test(i.message))).toBe(true);
  });

  it("reports invalid orbit elements (negative period, eccentricity out of range)", () => {
    const cfg = validConfig();
    cfg.bodies.planet.orbit.period = -100;
    cfg.bodies.planet.orbit.e = 1.5;
    const report = validateSimulationConfigV3(cfg);
    expect(report.ok).toBe(false);
    const paths = report.issues.map((i) => i.path);
    expect(paths).toContain("bodies.planet.orbit.period");
    expect(paths).toContain("bodies.planet.orbit.e");
  });

  it("reports zero star radius as invalid", () => {
    const cfg = validConfig();
    cfg.bodies.star.r = 0;
    const report = validateSimulationConfigV3(cfg);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.path === "bodies.star.r")).toBe(true);
  });

  it("reports NaN mass on star", () => {
    const cfg = validConfig();
    cfg.bodies.star.m = NaN;
    const report = validateSimulationConfigV3(cfg);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.path === "bodies.star.m")).toBe(true);
  });

  it("reports zero-vector observer direction", () => {
    const cfg = validConfig();
    cfg.bodies.observer = { dir: { x: 0, y: 0, z: 0 } };
    const report = validateSimulationConfigV3(cfg);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.path === "bodies.observer.dir" && /zero/i.test(i.message))).toBe(true);
  });
});

describe("assertValidSimulationConfigV3", () => {
  it("does not throw for valid config", () => {
    expect(() => assertValidSimulationConfigV3(validConfig())).not.toThrow();
  });

  it("throws with descriptive message for missing star", () => {
    const cfg = validConfig();

    delete (cfg.bodies as any).star;
    expect(() => assertValidSimulationConfigV3(cfg)).toThrowError(/bodies\.star/);
  });
});

describe("assertValidTimeRange", () => {
  it("accepts a valid time range", () => {
    expect(() => assertValidTimeRange({ startSec: 0, endSec: 100, stepSec: 1 })).not.toThrow();
  });

  it("throws for NaN stepSec", () => {
    expect(() => assertValidTimeRange({ startSec: 0, endSec: 100, stepSec: NaN })).toThrow();
  });

  it("throws when endSec < startSec", () => {
    expect(() => assertValidTimeRange({ startSec: 100, endSec: 0, stepSec: 1 })).toThrow();
  });
});
