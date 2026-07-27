/** Verifies transit transmission calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import { fluxStarWithTransmissiveOcculters } from "../../src/photometry/transitTransmission";

describe("fluxStarWithTransmissiveOcculters", () => {
  it("returns flux = 1 with no occulters", () => {
    const f = fluxStarWithTransmissiveOcculters({
      rStar: 1,
      occulters: [],
      gridRes: 100,
    });
    expect(f).toBeCloseTo(1, 10);
  });

  it("single opaque occulter at center reduces flux below 1", () => {
    const f = fluxStarWithTransmissiveOcculters({
      rStar: 1,
      occulters: [{ dx: 0, dy: 0, r0: 0.3 }],
      gridRes: 200,
      clamp01: true,
    });
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(0);
    // Approximate expected flux: 1 - (0.3)^2 / 1^2 = 1 - 0.09 = 0.91
    expect(f).toBeCloseTo(0.91, 1);
  });

  it("flux is between 0 and 1 with a semi-transparent atmosphere occulter", () => {
    // An occulter with a transmission function that is partially transparent.
    const f = fluxStarWithTransmissiveOcculters({
      rStar: 1,
      occulters: [
        {
          dx: 0,
          dy: 0,
          r0: 0.2,
          transmission: (rho: number) => {
            // Opaque core for rho <= 0.2, exponential decay halo beyond.
            if (rho <= 0.2) return 0;
            return Math.exp(-(rho - 0.2) / 0.1);
          },
        },
      ],
      gridRes: 200,
      clamp01: true,
    });
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
    expect(Number.isFinite(f)).toBe(true);
  });

  it("flux decreases as opaque disk radius increases", () => {
    const f1 = fluxStarWithTransmissiveOcculters({
      rStar: 1,
      occulters: [{ dx: 0, dy: 0, r0: 0.2 }],
      gridRes: 200,
    });
    const f2 = fluxStarWithTransmissiveOcculters({
      rStar: 1,
      occulters: [{ dx: 0, dy: 0, r0: 0.5 }],
      gridRes: 200,
    });
    expect(f2).toBeLessThan(f1);
  });

  it("returns flux = 1 when occulter is far outside the disk", () => {
    const f = fluxStarWithTransmissiveOcculters({
      rStar: 1,
      occulters: [{ dx: 10, dy: 10, r0: 0.5 }],
      gridRes: 100,
    });
    expect(f).toBeCloseTo(1, 10);
  });
});
