/** Verifies disk midpoint calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import { integrateDiskMidpoint, integrateDiskMidpointShapes } from "../../src/photometry/diskMidpoint";

function expectRelativeError(actual: number, expected: number, maximum: number): void {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(maximum);
}

function circleOverlapArea(radiusA: number, radiusB: number, separation: number): number {
  if (separation >= radiusA + radiusB) return 0;
  if (separation <= Math.abs(radiusA - radiusB)) {
    return Math.PI * Math.min(radiusA, radiusB) ** 2;
  }
  const first =
    radiusA ** 2 * Math.acos((separation ** 2 + radiusA ** 2 - radiusB ** 2) / (2 * separation * radiusA));
  const second =
    radiusB ** 2 * Math.acos((separation ** 2 + radiusB ** 2 - radiusA ** 2) / (2 * separation * radiusB));
  const radical =
    (-separation + radiusA + radiusB) *
    (separation + radiusA - radiusB) *
    (separation - radiusA + radiusB) *
    (separation + radiusA + radiusB);
  return first + second - 0.5 * Math.sqrt(Math.max(0, radical));
}

describe("integrateDiskMidpoint", () => {
  it("returns total > 0 and blocked = 0 with no occulters (center)", () => {
    const result = integrateDiskMidpoint({
      rStar: 1,
      occulters: [],
      gridRes: 100,
      intensityAt: () => 1,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.blocked).toBe(0);
    // For a uniform disk, total should approximate pi * rStar^2.
    expect(result.total).toBeCloseTo(Math.PI, 1);
  });

  it("blocks flux when an occulter is at disk center (dx=0, dy=0)", () => {
    const result = integrateDiskMidpoint({
      rStar: 1,
      occulters: [{ dx: 0, dy: 0, r: 0.5 }],
      gridRes: 200,
      intensityAt: () => 1,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.blocked).toBeGreaterThan(0);
    // Blocked area should approximate pi * 0.5^2.
    const expectedBlocked = Math.PI * 0.25;
    expect(result.blocked).toBeCloseTo(expectedBlocked, 1);
  });

  it("blocks flux when an occulter is at the disk edge", () => {
    // Occulter placed at the edge of the star, partially overlapping.
    const result = integrateDiskMidpoint({
      rStar: 1,
      occulters: [{ dx: 0.8, dy: 0, r: 0.3 }],
      gridRes: 200,
      intensityAt: () => 1,
    });
    expect(result.total).toBeGreaterThan(0);
    // Some flux should be blocked, but not all.
    expect(result.blocked).toBeGreaterThan(0);
    expect(result.blocked).toBeLessThan(result.total);
  });

  it("returns blocked = 0 for non-overlapping occulter", () => {
    // Occulter is far outside the star disk.
    const result = integrateDiskMidpoint({
      rStar: 1,
      occulters: [{ dx: 5, dy: 5, r: 0.5 }],
      gridRes: 100,
      intensityAt: () => 1,
    });
    expect(result.blocked).toBe(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("total approximately equals pi * rStar^2 for uniform intensity", () => {
    const rStar = 2;
    const result = integrateDiskMidpoint({
      rStar,
      occulters: [],
      gridRes: 200,
      intensityAt: () => 1,
    });
    const expectedArea = Math.PI * rStar * rStar;
    expect(result.total).toBeCloseTo(expectedArea, 0);
  });

  it("does not infer a whole-disk eclipse from an occulted lower limb", () => {
    const common = {
      rStar: 1,
      occulters: [{ dx: 0, dy: -0.9, r: 0.35 }],
      gridRes: 180,
      intensityAt: () => 1,
    };
    const complete = integrateDiskMidpoint(common);
    const bounded = integrateDiskMidpoint({ ...common, earlyExitFluxEps: 1e-3 });

    expect(bounded.earlyExit).toBeUndefined();
    expect(bounded.total).toBeCloseTo(complete.total, 12);
    expect(bounded.blocked).toBeCloseTo(complete.blocked, 12);
    expect((bounded.total - bounded.blocked) / bounded.total).toBeGreaterThan(0.9);
  });

  it("matches analytic uniform and linear-limb-darkened disk totals", () => {
    const uniform = integrateDiskMidpoint({
      rStar: 1,
      occulters: [],
      gridRes: 400,
      intensityAt: () => 1,
    });
    const linearCoefficient = 0.6;
    const limbDarkened = integrateDiskMidpoint({
      rStar: 1,
      occulters: [],
      gridRes: 400,
      intensityAt: ({ mu }) => 1 - linearCoefficient * (1 - mu),
    });

    expectRelativeError(uniform.total, Math.PI, 2e-4);
    expectRelativeError(limbDarkened.total, Math.PI * (1 - linearCoefficient / 3), 3e-4);
  });

  it("matches the analytic area of a grazing circular overlap", () => {
    const occulterRadius = 0.35;
    const separation = 0.85;
    const result = integrateDiskMidpoint({
      rStar: 1,
      occulters: [{ dx: separation, dy: 0, r: occulterRadius }],
      gridRes: 500,
      intensityAt: () => 1,
    });

    expectRelativeError(result.blocked, circleOverlapArea(1, occulterRadius, separation), 3e-3);
  });

  it("matches analytic disjoint-union and deep-eclipse areas", () => {
    const disjoint = integrateDiskMidpoint({
      rStar: 1,
      occulters: [
        { dx: -0.35, dy: 0, r: 0.2 },
        { dx: 0.35, dy: 0, r: 0.2 },
      ],
      gridRes: 500,
      intensityAt: () => 1,
    });
    const deep = integrateDiskMidpoint({
      rStar: 1,
      occulters: [{ dx: 0, dy: 0, r: 1.2 }],
      gridRes: 240,
      intensityAt: () => 1,
    });

    expectRelativeError(disjoint.blocked, 2 * Math.PI * 0.2 ** 2, 3e-3);
    expect(deep.blocked).toBeCloseTo(deep.total, 12);
  });

  it("matches centered ellipse and projected-ring analytic areas", () => {
    const ellipse = integrateDiskMidpointShapes({
      rStar: 1,
      occulters: [{ kind: "ellipse", dx: 0, dy: 0, rx: 0.45, ry: 0.25, angle: 0.4 }],
      gridRes: 500,
      intensityAt: () => 1,
    });
    const inclination = 0.4;
    const opacity = 0.6;
    const ring = integrateDiskMidpointShapes({
      rStar: 1,
      occulters: [
        {
          kind: "ring",
          dx: 0,
          dy: 0,
          rInner: 0.3,
          rOuter: 0.55,
          inc: inclination,
          angle: 0.3,
          opacity,
        },
      ],
      gridRes: 500,
      intensityAt: () => 1,
    });

    expectRelativeError(ellipse.blocked, Math.PI * 0.45 * 0.25, 4e-3);
    expectRelativeError(
      ring.blocked,
      Math.PI * (0.55 ** 2 - 0.3 ** 2) * Math.cos(inclination) * opacity,
      5e-3,
    );
  });

  it("converges toward the analytic uniform-disk integral as resolution increases", () => {
    const errorAt = (gridRes: number): number =>
      Math.abs(
        integrateDiskMidpoint({ rStar: 1, occulters: [], gridRes, intensityAt: () => 1 }).total - Math.PI,
      );
    const coarse = errorAt(60);
    const medium = errorAt(120);
    const fine = errorAt(240);

    expect(medium).toBeLessThan(coarse);
    expect(fine).toBeLessThan(medium);
  });
});
