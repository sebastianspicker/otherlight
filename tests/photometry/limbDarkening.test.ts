import { describe, expect, it } from "vitest";

import { fluxLimbDarkenedDiskQuadratic } from "../../src/photometry/transitQuadraticLD";

describe("fluxLimbDarkenedDiskQuadratic", () => {
  it("reduces flux when an occulter overlaps the stellar disk", () => {
    const f = fluxLimbDarkenedDiskQuadratic({
      rStar: 1,
      rOcculters: [{ dx: 0, dy: 0, r: 0.1 }],
      limbDarkening: { kind: "quadratic", u1: 0.35, u2: 0.25 },
      gridRes: 400,
    });
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(0);
  });
});
