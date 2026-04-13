import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { computeTransitFlux, MAX_SPECTRAL_SAMPLES } from "../../src/sim/transitFlux";

describe("computeTransitFlux spectral grid alignment", () => {
  it("keeps tauScale aligned with lambda samples after lambda filtering", () => {
    const params: SystemParams = {
      star: {
        r: 1,
        photometry: {
          gridRes: 64,
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

  it("caps oversized legacy spectral grids at the transit solver boundary", () => {
    const lambdaNm = Array.from({ length: MAX_SPECTRAL_SAMPLES + 24 }, (_, i) => 500 + i);
    const tauScale = lambdaNm.map((_, i) => (i < MAX_SPECTRAL_SAMPLES ? 0 : 8));

    const base: SystemParams = {
      star: {
        r: 1,
        photometry: {
          gridRes: 64,
          atmosphereTransmission: {
            enabled: true,
            kind: "exponential-halo",
            target: "planet",
            tau0: 6,
            H: 0.25,
            lambdaNm,
            tauScale,
          },
        },
      },
      planet: {
        r: 0.15,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    const truncated: SystemParams = {
      ...base,
      star: {
        ...base.star,
        photometry: {
          ...base.star.photometry,
          atmosphereTransmission: {
            ...base.star.photometry!.atmosphereTransmission!,
            lambdaNm: lambdaNm.slice(0, MAX_SPECTRAL_SAMPLES),
            tauScale: tauScale.slice(0, MAX_SPECTRAL_SAMPLES),
          },
        },
      },
    };

    const kin = {
      planetOrbit: base.planet.orbit as any,
      rBary: { x: 0, y: 0, z: 0 },
      rPlanetAbs: { x: 0, y: 0, z: 0 },
      planetSky: { x: 0.12, y: 0, z: 1 },
    };

    expect(computeTransitFlux(base, [], kin as any)).toBeCloseTo(
      computeTransitFlux(truncated, [], kin as any),
      8,
    );
  });

  it("reweights molecular-feature depths when spectral contamination is present", () => {
    const base: SystemParams = {
      star: {
        r: 1,
        photometry: {
          gridRes: 96,
          spectralBandpass: {
            enabled: true,
            lambdaNm: [500, 589, 760],
            weights: [1, 1, 1],
          },
          atmosphereRT: {
            enabled: true,
            target: "planet",
            lambdaRefNm: 589,
            layers: [{ r0: 0.16, H: 0.03, tau0: 0.9 }],
            molecularFeatures: {
              enabled: true,
              centerNm: [589],
              widthNm: [10],
              strength: [1.8],
            },
          },
        },
      },
      planet: {
        r: 0.16,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
      dynamics: {
        fidelityProfile: "accurate",
        physicsFeatures: { atmosphereRT: true },
      },
    };

    const contaminated: SystemParams = {
      ...base,
      star: {
        ...base.star,
        photometry: {
          ...base.star.photometry,
          atmosphereRT: {
            ...base.star.photometry!.atmosphereRT!,
            spectralContamination: {
              enabled: true,
              centerNm: [589],
              widthNm: [8],
              strength: [2.2],
            },
          },
        },
      },
    };

    const kin = {
      planetOrbit: base.planet.orbit as any,
      rBary: { x: 0, y: 0, z: 0 },
      rPlanetAbs: { x: 0, y: 0, z: 0 },
      planetSky: { x: 0.88, y: 0, z: 1 },
    };

    const cleanFlux = computeTransitFlux(base, [], kin as any);
    const contaminatedFlux = computeTransitFlux(contaminated, [], kin as any);

    expect(cleanFlux).toBeLessThan(1);
    expect(contaminatedFlux).toBeGreaterThan(cleanFlux);
  });
});
