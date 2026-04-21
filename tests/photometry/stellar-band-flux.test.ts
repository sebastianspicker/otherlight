import { describe, expect, it } from "vitest";

import {
  isSupportedStellarPassband,
  relativeStellarBandFlux,
  resolveDetachedBinaryLuminosities,
} from "../../src/photometry/stellarBandFlux";

const PLANCK_H = 6.626_070_15e-34;
const LIGHT_C = 299_792_458;
const BOLTZMANN_K = 1.380_649e-23;

function planckSpectralRadiance(lambdaM: number, teffK: number): number {
  const exponent = (PLANCK_H * LIGHT_C) / (lambdaM * BOLTZMANN_K * teffK);
  const denom = Math.expm1(Math.min(exponent, 700));
  if (!(denom > 0)) return 0;
  return (2 * PLANCK_H * LIGHT_C * LIGHT_C) / (Math.pow(lambdaM, 5) * denom);
}

describe("stellar band flux helper", () => {
  it("uses physical bandpass weighting when both detached-binary stars define radii and temperatures", () => {
    const resolved = resolveDetachedBinaryLuminosities({
      primary: { r: 1.1, teffK: 6_300, passband: "g", luminosityScale: 1 },
      secondary: { r: 0.9, teffK: 5_200, passband: "g", luminosityScale: 0.95 },
      fallbackPassband: "g",
      secondaryFallbackLuminosityScale: 0.3,
    });

    expect(resolved.source).toBe("physical-bandpass");
    expect(resolved.primary).toBeCloseTo(1, 12);
    expect(resolved.secondary).toBeGreaterThan(0);
    expect(resolved.secondary).toBeLessThan(0.95);
  });

  it("makes the cooler secondary relatively brighter in redder passbands", () => {
    const ratioG =
      resolveDetachedBinaryLuminosities({
        primary: { r: 1.15, teffK: 6_450, passband: "g" },
        secondary: { r: 0.82, teffK: 5_450, passband: "g" },
        fallbackPassband: "g",
        secondaryFallbackLuminosityScale: 0.3,
      }).secondary ?? 0;
    const ratioR =
      resolveDetachedBinaryLuminosities({
        primary: { r: 1.15, teffK: 6_450, passband: "r" },
        secondary: { r: 0.82, teffK: 5_450, passband: "r" },
        fallbackPassband: "r",
        secondaryFallbackLuminosityScale: 0.3,
      }).secondary ?? 0;

    expect(ratioR).toBeGreaterThan(ratioG);
  });

  it("falls back to compatibility luminosity scales when physical stellar inputs are incomplete", () => {
    const resolved = resolveDetachedBinaryLuminosities({
      primary: { r: 1, luminosityScale: 1 },
      secondary: { r: 1, luminosityScale: 0.4 },
      fallbackPassband: "g",
      secondaryFallbackLuminosityScale: 0.3,
    });

    expect(resolved.source).toBe("compatibility-scale");
    expect(resolved.primary).toBeCloseTo(1, 12);
    expect(resolved.secondary).toBeCloseTo(0.4, 12);
  });

  it("returns a larger physical scalar for a hotter star at fixed radius and passband", () => {
    const cooler = relativeStellarBandFlux({ r: 1, teffK: 5_000, passband: "g" }) ?? 0;
    const hotter = relativeStellarBandFlux({ r: 1, teffK: 6_500, passband: "g" }) ?? 0;

    expect(hotter).toBeGreaterThan(cooler);
  });

  it("uses bounded band integration instead of collapsing a passband to one effective wavelength", () => {
    const integrated = relativeStellarBandFlux({ r: 1, teffK: 4_500, passband: "g" }) ?? 0;
    const singleWavelength = planckSpectralRadiance(477e-9, 4_500);

    expect(integrated).toBeGreaterThan(0);
    expect(Math.abs(integrated - singleWavelength) / singleWavelength).toBeGreaterThan(0.005);
  });

  it("treats unsupported explicit passbands as unsupported instead of silently collapsing them to v", () => {
    expect(isSupportedStellarPassband("g")).toBe(true);
    expect(isSupportedStellarPassband("bogus")).toBe(false);
    expect(relativeStellarBandFlux({ r: 1, teffK: 5_500, passband: "bogus" as never })).toBeUndefined();
  });
});
