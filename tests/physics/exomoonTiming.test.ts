/** Verifies exomoon timing calculations in orbital dynamics and numerical integration. */

import { describe, expect, it } from "vitest";

import {
  applyOrientationEvolution,
  impactParameterFromProjectedSky,
  impactParameterFromSkyY,
  tdvRatioFromSkyPlaneSpeeds,
} from "../../src/physics/exomoonTiming";

describe("exomoon timing helpers", () => {
  it("applies linear orientation drift with angle wrapping", () => {
    const evolved = applyOrientationEvolution(
      { a: 1, e: 0.1, inc: 0.3, Omega: 1, omega: 2, period: 10, t0: 0 },
      10,
      {
        enabled: true,
        tRef: 0,
        OmegaDot: 0.1,
        omegaDot: -0.2,
        incDot: 0.05,
        wrapAngles: "2pi",
      },
    );

    expect(evolved.Omega).toBeCloseTo(2, 12);
    expect(evolved.omega).toBeCloseTo(0, 12);
    expect(evolved.inc).toBeCloseTo(0.8, 12);
  });

  it("computes impact parameters only for front-of-star projected geometry", () => {
    expect(impactParameterFromSkyY(2, 4)).toBeCloseTo(0.5, 12);
    expect(impactParameterFromProjectedSky({ x: 3, y: 4, z: 1 }, 2)).toBeCloseTo(2.5, 12);
    expect(impactParameterFromProjectedSky({ x: 3, y: 4, z: -1 }, 2)).toBeNaN();
  });

  it("returns finite TDV ratios for positive sky-plane speeds", () => {
    expect(tdvRatioFromSkyPlaneSpeeds(4, 2)).toBeCloseTo(2, 12);
    expect(tdvRatioFromSkyPlaneSpeeds(4, 0)).toBeNaN();
  });
});
