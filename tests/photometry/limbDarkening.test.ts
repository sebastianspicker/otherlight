import { describe, expect, it } from "vitest";

import { fluxLimbDarkenedDiskDetailed } from "../../src/photometry/transitLimbDarkened";

describe("fluxLimbDarkenedDiskDetailed", () => {
  it("reduces flux when an occulter overlaps the stellar disk", () => {
    const f = fluxLimbDarkenedDiskDetailed({
      rStar: 1,
      rOcculters: [{ dx: 0, dy: 0, r: 0.1 }],
      limbDarkeningLaw: { kind: "quadratic", u1: 0.35, u2: 0.25 },
      gridRes: 400,
    }).flux;
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(0);
  });
});
