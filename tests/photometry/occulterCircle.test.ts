import { describe, expect, it } from "vitest";

import {
  sanitizeCircleOcculters,
  anyCircleOcculterFullyCoversStar,
  clampGridRes,
  pointInCircleOcculter,
} from "../../src/photometry/occulterCircle";

describe("sanitizeCircleOcculters", () => {
  it("returns empty for no occulters", () => {
    expect(sanitizeCircleOcculters(1, [])).toEqual([]);
    expect(sanitizeCircleOcculters(1, undefined)).toEqual([]);
  });

  it("keeps an occulter that overlaps the star", () => {
    const result = sanitizeCircleOcculters(1, [{ dx: 0, dy: 0, r: 0.5 }]);
    expect(result).toHaveLength(1);
  });

  it("rejects an occulter too far from the star", () => {
    // d = sqrt(10^2+0^2) = 10, rStar + rOcc = 1+0.5 = 1.5 => no overlap
    const result = sanitizeCircleOcculters(1, [{ dx: 10, dy: 0, r: 0.5 }]);
    expect(result).toHaveLength(0);
  });

  it("rejects occulters with invalid r", () => {
    const result = sanitizeCircleOcculters(1, [
      { dx: 0, dy: 0, r: 0 },
      { dx: 0, dy: 0, r: -1 },
      { dx: 0, dy: 0, r: NaN },
    ]);
    expect(result).toHaveLength(0);
  });

  it("rejects occulters with non-finite dx/dy", () => {
    const result = sanitizeCircleOcculters(1, [
      { dx: NaN, dy: 0, r: 0.5 },
      { dx: 0, dy: Infinity, r: 0.5 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("rejects when rStar is not positive", () => {
    expect(sanitizeCircleOcculters(0, [{ dx: 0, dy: 0, r: 0.5 }])).toEqual([]);
    expect(sanitizeCircleOcculters(-1, [{ dx: 0, dy: 0, r: 0.5 }])).toEqual([]);
    expect(sanitizeCircleOcculters(NaN, [{ dx: 0, dy: 0, r: 0.5 }])).toEqual([]);
  });
});

describe("anyCircleOcculterFullyCoversStar", () => {
  it("returns true when an occulter fully covers the star (concentric)", () => {
    expect(anyCircleOcculterFullyCoversStar(1, [{ dx: 0, dy: 0, r: 2 }])).toBe(true);
  });

  it("returns true when occulter just covers the star (exact boundary)", () => {
    // rOcc=1 == rStar=1, d=0 => d <= rOcc-rStar => 0 <= 0
    expect(anyCircleOcculterFullyCoversStar(1, [{ dx: 0, dy: 0, r: 1 }])).toBe(true);
  });

  it("returns false when occulter is smaller than the star", () => {
    expect(anyCircleOcculterFullyCoversStar(1, [{ dx: 0, dy: 0, r: 0.5 }])).toBe(false);
  });

  it("returns false when occulter is large but offset too far", () => {
    // rOcc=1.5, rStar=1, d=hypot(0.6,0)=0.6, rOcc-rStar=0.5, d > 0.5 => not full cover
    expect(anyCircleOcculterFullyCoversStar(1, [{ dx: 0.6, dy: 0, r: 1.5 }])).toBe(false);
  });

  it("returns false for empty or undefined occulters", () => {
    expect(anyCircleOcculterFullyCoversStar(1, [])).toBe(false);
    expect(anyCircleOcculterFullyCoversStar(1, undefined)).toBe(false);
  });
});

describe("clampGridRes", () => {
  it("returns the value when within range", () => {
    expect(clampGridRes(200, 100)).toBe(200);
  });

  it("clamps below the minimum", () => {
    expect(clampGridRes(10, 100)).toBe(60);
  });

  it("clamps above the maximum", () => {
    expect(clampGridRes(10000, 100)).toBe(4096);
  });

  it("uses fallback for non-finite input", () => {
    expect(clampGridRes(NaN, 100)).toBe(100);
    expect(clampGridRes(undefined, 100)).toBe(100);
  });

  it("respects custom min/max options", () => {
    expect(clampGridRes(5, 100, { minRes: 10, maxRes: 50 })).toBe(10);
    expect(clampGridRes(200, 100, { minRes: 10, maxRes: 50 })).toBe(50);
  });
});

describe("pointInCircleOcculter", () => {
  it("returns true for a point inside the circle", () => {
    expect(pointInCircleOcculter(0.1, 0.1, { dx: 0, dy: 0, r: 1 })).toBe(true);
  });

  it("returns false for a point outside the circle", () => {
    expect(pointInCircleOcculter(2, 0, { dx: 0, dy: 0, r: 1 })).toBe(false);
  });

  it("returns false for a point exactly on the boundary (tangency)", () => {
    expect(pointInCircleOcculter(1, 0, { dx: 0, dy: 0, r: 1 })).toBe(false);
  });
});
