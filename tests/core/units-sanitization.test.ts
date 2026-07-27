/** Verifies units sanitization contracts in shared app and physics primitives. */

import { describe, expect, it } from "vitest";

import { clamp, toFiniteNonNeg, toFiniteNumber, toFinitePos, toFinitePositiveOr } from "../../src/core/units";

describe("numeric sanitization helpers", () => {
  it("maps non-finite clamp input to the lower bound", () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
    expect(clamp(Number.POSITIVE_INFINITY, 8, 2)).toBe(2);
  });

  it("keeps fallback coercion explicit for shared finite guards", () => {
    expect(toFiniteNumber("3.5", 1)).toBe(3.5);
    expect(toFiniteNumber("bad", 7)).toBe(7);
    expect(toFiniteNumber("", 7)).toBe(7);
    expect(toFiniteNumber(null, 7)).toBe(7);
    expect(toFiniteNumber(false, 7)).toBe(7);
    expect(toFiniteNonNeg(-3, 5)).toBe(0);
    expect(toFinitePositiveOr("bad", 2)).toBe(2);
    expect(toFinitePos(0, 4)).toBeGreaterThan(0);
  });
});
