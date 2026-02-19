import { describe, expect, it } from "vitest";

import {
  layerOpticalDepthAtRadius,
  totalAtmosphereTransmission,
} from "../../src/photometry/atmosphereRT/model";

describe("atmosphereRT model", () => {
  it("increases optical depth with cloud contribution", () => {
    const base = layerOpticalDepthAtRadius({
      rho: 2,
      layer: { r0: 1, H: 0.5, tau0: 0.2 },
      lambdaNm: 550,
      lambdaRefNm: 550,
    });
    const cloud = layerOpticalDepthAtRadius({
      rho: 2,
      layer: { r0: 1, H: 0.5, tau0: 0.2, cloudOpacity: 0.3 },
      lambdaNm: 550,
      lambdaRefNm: 550,
    });

    expect(cloud).toBeGreaterThan(base);
  });

  it("returns bounded transmission in (0,1]", () => {
    const t = totalAtmosphereTransmission({
      rho: 2,
      config: {
        enabled: true,
        lambdaRefNm: 550,
        layers: [{ r0: 1, H: 0.4, tau0: 0.4, alpha: 1 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0.5 },
      },
      lambdaNm: 600,
    });

    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(1);
  });
});
