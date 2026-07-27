/** Verifies transit uniform calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import { fluxUniformDisk } from "../../src/photometry/transitUniform";

describe("fluxUniformDisk (uniform disk transit)", () => {
  it("is 1.0 with no occulters", () => {
    expect(fluxUniformDisk({ rStar: 1, rOcculters: [] })).toBeCloseTo(1, 12);
  });

  it("is 0.0 when an occulter fully covers the star", () => {
    expect(fluxUniformDisk({ rStar: 1, rOcculters: [{ dx: 0, dy: 0, r: 2 }] })).toBe(0);
  });

  it("is symmetric in dx (left/right)", () => {
    const a = fluxUniformDisk({ rStar: 1, rOcculters: [{ dx: 0.3, dy: 0.2, r: 0.2 }], gridRes: 500 });
    const b = fluxUniformDisk({ rStar: 1, rOcculters: [{ dx: -0.3, dy: 0.2, r: 0.2 }], gridRes: 500 });
    expect(Math.abs(a - b)).toBeLessThan(5e-4);
  });
});
