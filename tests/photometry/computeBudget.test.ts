/** Verifies compute budget calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import {
  estimateTransitPointEvaluations,
  MAX_SPECTRAL_SAMPLES,
  MAX_TRANSIT_POINT_EVALUATIONS,
  maxSmearingSubsamplesForGrid,
  maxSmearingSubsamplesForParams,
  maxSpectralSamplesForGrid,
} from "../../src/core/transitComputeBudget";

const paramsWithPhotometry = (photometry: NonNullable<SystemParams["star"]["photometry"]>): SystemParams => ({
  star: { r: 1, photometry },
  planet: {
    r: 0.1,
    orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
  },
});

describe("transit compute budget", () => {
  it("retains low-resolution spectral capacity and bounds high-resolution grids", () => {
    expect(maxSpectralSamplesForGrid(64)).toBe(MAX_SPECTRAL_SAMPLES);
    expect(maxSpectralSamplesForGrid(220)).toBe(21);
    expect(maxSpectralSamplesForGrid(1024)).toBe(1);
  });

  it("accounts for active spectral transmission when estimating synchronous work", () => {
    const params = paramsWithPhotometry({
      gridRes: 220,
      atmosphereTransmission: {
        enabled: true,
        lambdaNm: Array.from({ length: 40 }, (_, index) => 500 + index),
      },
    });

    expect(estimateTransitPointEvaluations(params)).toBe(220 * 220 * 21);
    expect(estimateTransitPointEvaluations(params)).toBeLessThanOrEqual(MAX_TRANSIT_POINT_EVALUATIONS);
  });

  it("falls back to legacy wavelengths when an enabled bandpass is empty", () => {
    const params = paramsWithPhotometry({
      gridRes: 220,
      spectralBandpass: { enabled: true, lambdaNm: [] },
      atmosphereTransmission: { enabled: true, lambdaNm: [500, 600, 700] },
    });

    expect(estimateTransitPointEvaluations(params)).toBe(220 * 220 * 3);
  });

  it("uses the transmissive solver fallback when grid resolution is omitted", () => {
    const params = paramsWithPhotometry({
      atmosphereTransmission: {
        enabled: true,
        lambdaNm: Array.from({ length: 40 }, (_, index) => 500 + index),
      },
    });

    expect(maxSpectralSamplesForGrid(undefined, 256)).toBe(16);
    expect(estimateTransitPointEvaluations(params)).toBe(256 * 256 * 16);
    expect(estimateTransitPointEvaluations(params)).toBe(MAX_TRANSIT_POINT_EVALUATIONS);
  });

  it("reserves the instantaneous step before budgeting cadence smearing", () => {
    expect(maxSmearingSubsamplesForGrid(220)).toBe(20);
    expect(maxSmearingSubsamplesForGrid(1024)).toBe(1);

    const spectralParams = paramsWithPhotometry({
      gridRes: 220,
      atmosphereTransmission: { enabled: true, lambdaNm: [500, 600, 700] },
    });
    expect(maxSmearingSubsamplesForParams(spectralParams)).toBe(6);
  });
});
