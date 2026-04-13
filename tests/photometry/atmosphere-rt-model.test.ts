import { describe, expect, it } from "vitest";

import {
  effectiveCircleAtmosphereOpacity,
  layerOpticalDepthAtRadius,
  spectralContaminationWeight,
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

  it("uses annulus-integrated opacity instead of a single immediate-limb sample", () => {
    const config = {
      enabled: true as const,
      lambdaRefNm: 550,
      layers: [{ r0: 1, H: 0.5, tau0: 0.8, cloudOpacity: 0.2 }],
      cloudHaze: { enabled: true as const, cloudDeckTau: 0.15, hazeTau: 0.05, hazeSlope: 0 },
    };

    const edgeOpacity = 1 - totalAtmosphereTransmission({ rho: 1.01, config, lambdaNm: 550 });
    const integratedOpacity = effectiveCircleAtmosphereOpacity({
      bodyRadius: 1,
      config,
      lambdaNm: 550,
      radialSamples: 48,
    });

    expect(integratedOpacity).toBeGreaterThan(0);
    expect(integratedOpacity).toBeLessThan(1);
    expect(integratedOpacity).toBeLessThan(edgeOpacity);
  });

  it("increases molecular opacity near configured line centers", () => {
    const config = {
      enabled: true as const,
      lambdaRefNm: 550,
      layers: [{ r0: 1, H: 0.3, tau0: 0.25 }],
      molecularFeatures: {
        enabled: true as const,
        centerNm: [589],
        widthNm: [8],
        strength: [1.2],
      },
    };

    const atLine = totalAtmosphereTransmission({ rho: 1.2, config, lambdaNm: 589 });
    const offLine = totalAtmosphereTransmission({ rho: 1.2, config, lambdaNm: 650 });

    expect(atLine).toBeLessThan(offLine);
  });

  it("downweights contaminated wavelengths in the synthetic bandpass", () => {
    const config = {
      enabled: true as const,
      spectralContamination: {
        enabled: true as const,
        centerNm: [760],
        widthNm: [10],
        strength: [1.6],
      },
    };

    const inBand = spectralContaminationWeight({ lambdaNm: 760, config });
    const cleanBand = spectralContaminationWeight({ lambdaNm: 550, config });

    expect(inBand).toBeGreaterThanOrEqual(0);
    expect(inBand).toBeLessThan(cleanBand);
    expect(cleanBand).toBeLessThanOrEqual(1);
  });
});
