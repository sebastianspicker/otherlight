/** Verifies disk midpoint calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import { integrateDiskMidpoint } from "../../src/photometry/diskMidpoint";

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
});
