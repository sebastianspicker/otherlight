import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { assertStepInputs } from "../../src/sim/validation";

function baseParams(): SystemParams {
  return {
    star: { r: 1, m: 1 },
    planet: {
      r: 0.1,
      m: 1,
      orbit: { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      rings: { innerRadius: 0.15, outerRadius: 0.25 },
    },
  };
}

describe("assertStepInputs ring angle validation", () => {
  it("rejects non-finite ring inclination", () => {
    const params = baseParams();
    params.planet.rings = {
      innerRadius: 0.15,
      outerRadius: 0.25,
      inclination: Number.NaN,
    };

    expect(() => assertStepInputs(params, 0)).toThrow(/inclination/i);
  });

  it("rejects non-finite ring position angle", () => {
    const params = baseParams();
    params.planet.rings = {
      innerRadius: 0.15,
      outerRadius: 0.25,
      positionAngle: Number.POSITIVE_INFINITY,
    };

    expect(() => assertStepInputs(params, 0)).toThrow(/positionAngle/i);
  });
});
