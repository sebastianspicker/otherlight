import { describe, expect, it } from "vitest";

import { circleIntersectionArea, visibleFractionWhenOcculted } from "../../src/photometry/mutualEvents";

describe("circleIntersectionArea", () => {
  it("returns 0 when circles do not overlap", () => {
    const area = circleIntersectionArea(10, 1, 1);
    expect(area).toBe(0);
  });

  it("returns full smaller circle area on complete containment", () => {
    const area = circleIntersectionArea(0, 2, 1);
    expect(area).toBeCloseTo(Math.PI, 10);
  });

  it("returns partial overlap between 0 and full circle area", () => {
    const area = circleIntersectionArea(1, 1, 1);
    expect(area).toBeGreaterThan(0);
    expect(area).toBeLessThan(Math.PI);
  });

  it("is symmetric in (r1, r2)", () => {
    const a12 = circleIntersectionArea(0.5, 1.5, 0.8);
    const a21 = circleIntersectionArea(0.5, 0.8, 1.5);
    expect(a12).toBeCloseTo(a21, 12);
  });
});

describe("visibleFractionWhenOcculted", () => {
  it("returns 1 (full visibility) when circles do not overlap", () => {
    const v = visibleFractionWhenOcculted({
      targetSky: { x: 0, y: 0, z: 0 },
      occulterSky: { x: 100, y: 100, z: 1 },
      rTarget: 1,
      rOcculter: 1,
    });
    expect(v).toBeCloseTo(1, 12);
  });

  it("returns reduced visibility (< 1) on complete overlap from front", () => {
    // Occulter is in front (z > target z) and same center, same radius => fully occulted.
    const v = visibleFractionWhenOcculted({
      targetSky: { x: 0, y: 0, z: 0 },
      occulterSky: { x: 0, y: 0, z: 1 },
      rTarget: 1,
      rOcculter: 1,
    });
    expect(v).toBeCloseTo(0, 10);
  });

  it("returns 1 when occulter is behind the target (z <= target z)", () => {
    const v = visibleFractionWhenOcculted({
      targetSky: { x: 0, y: 0, z: 1 },
      occulterSky: { x: 0, y: 0, z: 0 },
      rTarget: 1,
      rOcculter: 1,
    });
    expect(v).toBeCloseTo(1, 12);
  });

  it("partial overlap yields visibility between 0 and 1", () => {
    // Partially overlapping, occulter in front.
    const v = visibleFractionWhenOcculted({
      targetSky: { x: 0, y: 0, z: 0 },
      occulterSky: { x: 1, y: 0, z: 1 },
      rTarget: 1,
      rOcculter: 1,
    });
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
    expect(Number.isFinite(v)).toBe(true);
  });

  it("returns 1 when occulter is at the same depth (z equal)", () => {
    const v = visibleFractionWhenOcculted({
      targetSky: { x: 0, y: 0, z: 5 },
      occulterSky: { x: 0, y: 0, z: 5 },
      rTarget: 1,
      rOcculter: 1,
    });
    expect(v).toBeCloseTo(1, 12);
  });
});
