import { beforeEach, describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { getNBodyStateAt, resetNBodyCache } from "../../src/sim/dynamics";

beforeEach(() => {
  resetNBodyCache();
});

describe("n-body non-finite distance handling", () => {
  it("throws when pairwise squared distance becomes non-finite", () => {
    const huge = 1e308;

    const params: SystemParams = {
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 1e-3,
        orbit: { a: huge, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
      moon: {
        r: 0.01,
        m: 1e-6,
        orbitAroundPlanet: { a: huge * 0.5, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          muStar: 1,
          muPlanet: 1e-3,
          muMoon: 1e-6,
          dtMax: 1,
        },
      },
    };

    expect(() => getNBodyStateAt(params, 1)).toThrow();
  });
});
