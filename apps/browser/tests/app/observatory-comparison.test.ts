/** Verifies that the observatory explores one variable without changing the accepted scenario. */
import { describe, expect, it } from "vitest";
import { cloneParams } from "../../src/application/scenario";
import { PRESETS } from "../../src/application/presets";
import {
  prepareRadiusComparison,
  readComparisonRadiusKm,
} from "../../src/presentation/controllers/observatoryComparison";
import { findObservatoryTransit } from "../../src/presentation/controllers/observatoryTransit";

const scenario = () => cloneParams(PRESETS.find((preset) => preset.id === "kepler-planet-only")!.params);

describe("observatory radius comparison", () => {
  it.each(["", " ", "NaN", "Infinity", "-1", "999", "200001"])("rejects invalid radius %s", (value) => {
    expect(() => readComparisonRadiusKm(value, 1000, 200000)).toThrow("Enter a planet radius");
  });

  it("accepts boundary and fractional radii in kilometres", () => {
    expect(readComparisonRadiusKm("1000", 1000, 200000)).toBe(1000);
    expect(readComparisonRadiusKm("200000", 1000, 200000)).toBe(200000);
    expect(readComparisonRadiusKm("69570.5", 1000, 200000)).toBe(69570.5);
  });

  it("finds a transit away from the initial time and computes real distinct curves without mutating A", () => {
    const accepted = scenario();
    const original = structuredClone(accepted);
    const time = findObservatoryTransit(accepted, 0);
    expect(time).toBeDefined();
    expect(time).toBeGreaterThan(0);
    expect(time).toBeLessThan(accepted.planet.orbit.period);
    const result = prepareRadiusComparison(accepted, 100000, time!);
    expect(accepted).toEqual(original);
    expect(result.comparison.fluxTransitDelta).toBeGreaterThan(0);
    expect(result.estimateB / result.estimateA).toBeCloseTo((100000000 / accepted.planet.r) ** 2);
    const curves = result.comparison.visual!.curveSeries;
    expect(curves).toHaveLength(2);
    expect(curves[0].samples).not.toEqual(curves[1].samples);
    expect(result.text).toContain("Education model");
    expect(result.text).toContain("uniform star, full overlap");
  });

  it("reports no estimate for a face-on orbit rather than fabricating a transit", () => {
    const accepted = scenario();
    accepted.planet.orbit.inc = 0;
    expect(findObservatoryTransit(accepted, 0)).toBeUndefined();
  });
});
