/** Verifies barycenter calculations in orbital dynamics and numerical integration. */

import { describe, expect, it } from "vitest";

import { trySplitBarycentricPair } from "../../src/physics/barycenter";

describe("trySplitBarycentricPair", () => {
  it("splits a relative two-body state around the barycenter", () => {
    const split = trySplitBarycentricPair({
      rBary: { x: 0, y: 0, z: 0 },
      rRel: { x: 1, y: 0, z: 0 },
      mPrimary: 2,
      mSecondary: 1,
    });

    expect(split?.muSecondary).toBeCloseTo(1 / 3, 12);
    expect(split?.muPrimary).toBeCloseTo(2 / 3, 12);
    expect(split?.rPrimary.x).toBeCloseTo(-1 / 3, 12);
    expect(split?.rSecondary.x).toBeCloseTo(2 / 3, 12);
  });

  it("returns null for invalid masses", () => {
    expect(
      trySplitBarycentricPair({
        rBary: { x: 0, y: 0, z: 0 },
        rRel: { x: 1, y: 0, z: 0 },
        mPrimary: -1,
        mSecondary: 1,
      }),
    ).toBeNull();
  });
});
