/** Verifies occulter ellipse calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import {
  isCircleOcculter,
  isEllipseOcculter,
  isRingOcculter,
  sanitizeOcculterShapes,
  type OcculterShape,
} from "../../src/photometry/occulterEllipse";

describe("isCircleOcculter", () => {
  it("returns true for objects without a kind field", () => {
    expect(isCircleOcculter({ dx: 0, dy: 0, r: 1 } as OcculterShape)).toBe(true);
  });

  it("returns true for kind=circle", () => {
    expect(isCircleOcculter({ kind: "circle", dx: 0, dy: 0, r: 1 } as OcculterShape)).toBe(true);
  });

  it("returns true for kind=undefined", () => {
    expect(isCircleOcculter({ kind: undefined, dx: 0, dy: 0, r: 1 } as OcculterShape)).toBe(true);
  });

  it("returns false for kind=ellipse", () => {
    expect(isCircleOcculter({ kind: "ellipse", dx: 0, dy: 0, rx: 1, ry: 0.5 } as OcculterShape)).toBe(false);
  });

  it("returns false for kind=ring", () => {
    expect(isCircleOcculter({ kind: "ring", dx: 0, dy: 0, rInner: 0.5, rOuter: 1 } as OcculterShape)).toBe(
      false,
    );
  });
});

describe("isEllipseOcculter", () => {
  it("returns true for kind=ellipse", () => {
    expect(isEllipseOcculter({ kind: "ellipse", dx: 0, dy: 0, rx: 1, ry: 0.5 } as OcculterShape)).toBe(true);
  });

  it("returns false for circle occulter", () => {
    expect(isEllipseOcculter({ dx: 0, dy: 0, r: 1 } as OcculterShape)).toBe(false);
  });

  it("returns false for ring occulter", () => {
    expect(isEllipseOcculter({ kind: "ring", dx: 0, dy: 0, rInner: 0.5, rOuter: 1 } as OcculterShape)).toBe(
      false,
    );
  });
});

describe("isRingOcculter", () => {
  it("returns true for kind=ring", () => {
    expect(isRingOcculter({ kind: "ring", dx: 0, dy: 0, rInner: 0.5, rOuter: 1 } as OcculterShape)).toBe(
      true,
    );
  });

  it("returns false for circle occulter", () => {
    expect(isRingOcculter({ dx: 0, dy: 0, r: 1 } as OcculterShape)).toBe(false);
  });

  it("returns false for ellipse occulter", () => {
    expect(isRingOcculter({ kind: "ellipse", dx: 0, dy: 0, rx: 1, ry: 0.5 } as OcculterShape)).toBe(false);
  });
});

describe("sanitizeOcculterShapes", () => {
  it("returns empty for no occulters", () => {
    expect(sanitizeOcculterShapes(1, [])).toEqual([]);
    expect(sanitizeOcculterShapes(1, undefined)).toEqual([]);
  });

  it("keeps a valid circle occulter that overlaps the star", () => {
    const result = sanitizeOcculterShapes(1, [{ dx: 0, dy: 0, r: 0.5 } as OcculterShape]);
    expect(result).toHaveLength(1);
  });

  it("keeps a valid ellipse occulter that overlaps the star", () => {
    const result = sanitizeOcculterShapes(1, [
      { kind: "ellipse", dx: 0, dy: 0, rx: 0.5, ry: 0.3 } as OcculterShape,
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps a valid ring occulter that overlaps the star", () => {
    const result = sanitizeOcculterShapes(1, [
      { kind: "ring", dx: 0, dy: 0, rInner: 0.3, rOuter: 0.8 } as OcculterShape,
    ]);
    expect(result).toHaveLength(1);
  });

  it("rejects occulters too far away", () => {
    const result = sanitizeOcculterShapes(1, [
      { kind: "ellipse", dx: 100, dy: 0, rx: 0.5, ry: 0.3 } as OcculterShape,
    ]);
    expect(result).toHaveLength(0);
  });

  it("rejects ring with rOuter <= rInner", () => {
    const result = sanitizeOcculterShapes(1, [
      { kind: "ring", dx: 0, dy: 0, rInner: 1, rOuter: 0.5 } as OcculterShape,
    ]);
    expect(result).toHaveLength(0);
  });
});
