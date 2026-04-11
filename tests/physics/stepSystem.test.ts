import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { stepSystem } from "../../src/sim/sim";

describe("stepSystem", () => {
  it("returns finite flux and produces a transit dip when the planet is in front of the star", () => {
    const period = 1000;

    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
      planet: {
        r: 0.1,
        orbit: {
          a: 5,
          e: 0,
          // With observer along +z: inc=90deg makes the orbit pass through +z at quarter period.
          inc: Math.PI / 2,
          Omega: 0,
          omega: 0,
          period,
          t0: 0,
        },
      },
    };

    const noTransit = stepSystem(params, 0);
    expect(Number.isFinite(noTransit.fluxTotal)).toBe(true);
    expect(Number.isFinite(noTransit.fluxTransitFactor)).toBe(true);
    expect(noTransit.fluxTransitFactor).toBeCloseTo(1, 6);

    const transit = stepSystem(params, period / 4);
    expect(Number.isFinite(transit.fluxTotal)).toBe(true);
    expect(Number.isFinite(transit.fluxTransitFactor)).toBe(true);
    expect(transit.fluxTransitFactor).toBeLessThan(0.999);
    expect(transit.fluxTotal).toBeLessThan(0.999);
  });
});
