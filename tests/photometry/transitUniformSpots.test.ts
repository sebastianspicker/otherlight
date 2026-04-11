import { describe, expect, it } from "vitest";

import type { BrightnessPatch } from "../../src/core/types";
import { spotFluxFactorFromPatches } from "../../src/photometry/transitUniformSpots";

describe("spotFluxFactorFromPatches", () => {
  it("allows bright faculae patches to increase stellar baseline above 1", () => {
    const patches: BrightnessPatch[] = [
      {
        shape: "circle",
        x: 0,
        y: 0,
        r: 2,
        factor: 1.2,
      },
    ];

    const f = spotFluxFactorFromPatches({ rStar: 1, patches, gridRes: 140 });
    expect(f).toBeGreaterThan(1);
    expect(f).toBeCloseTo(1.2, 2);
  });
});
