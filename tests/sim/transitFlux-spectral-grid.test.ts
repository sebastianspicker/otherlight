import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { computeTransitFlux } from "../../src/sim/transitFlux";

describe("computeTransitFlux spectral grid alignment", () => {
  it("keeps tauScale aligned with lambda samples after lambda filtering", () => {
    const params: SystemParams = {
      star: {
        r: 1,
        photometry: {
          gridRes: 220,
          atmosphereTransmission: {
            enabled: true,
            kind: "exponential-halo",
            target: "planet",
            tau0: 40,
            H: 1,
            lambdaNm: [500, Number.NaN, 600],
            tauScale: [0, 10, 0],
          },
        },
      },
      planet: {
        r: 1e-9,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    const kin = {
      planetOrbit: params.planet.orbit as any,
      rBary: { x: 0, y: 0, z: 0 },
      rPlanetAbs: { x: 0, y: 0, z: 0 },
      planetSky: { x: 0, y: 0, z: 1 },
    };

    const f = computeTransitFlux(params, [], kin as any);
    expect(f).toBeGreaterThan(0.99);
  });
});
