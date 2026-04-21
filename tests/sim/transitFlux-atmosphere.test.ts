import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { computeTransitFlux } from "../../src/sim/transitFlux";

describe("computeTransitFlux atmosphere transmission", () => {
  it("does not attenuate flux when the transmissive body is far from stellar disk overlap", () => {
    const params: SystemParams = {
      star: {
        r: 1,
        photometry: {
          gridRes: 220,
          atmosphereTransmission: {
            enabled: true,
            kind: "exponential-halo",
            target: "planet",
            r0: 0.1,
            H: 100,
            tau0: 5,
          },
        },
      },
      planet: {
        r: 0.1,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    const kin = {
      planetOrbit: params.planet.orbit as any,
      rBary: { x: 0, y: 0, z: 0 },
      rPlanetAbs: { x: 0, y: 0, z: 0 },
      planetSky: { x: 10, y: 0, z: 1 },
      moonSky: undefined,
      rMoonAbs: undefined,
    };

    const f = computeTransitFlux(params, [], kin as any);
    expect(f).toBeCloseTo(1, 12);
  });
});
