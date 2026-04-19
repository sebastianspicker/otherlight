import { describe, expect, it } from "vitest";

import {
  fallbackStepV3,
  finitePositive,
  FIXED_PLOT_MIN_HALF_WINDOW_SEC,
  FIXED_PLOT_SAMPLE_COUNT,
} from "../../src/app/frameLoopFallback";

describe("finitePositive", () => {
  it("returns the value for a finite positive number", () => {
    expect(finitePositive(1)).toBe(1);
    expect(finitePositive(0.001)).toBe(0.001);
    expect(finitePositive(1e9)).toBe(1e9);
  });

  it("returns undefined for zero", () => {
    expect(finitePositive(0)).toBeUndefined();
  });

  it("returns undefined for negative numbers", () => {
    expect(finitePositive(-1)).toBeUndefined();
  });

  it("returns undefined for non-finite values", () => {
    expect(finitePositive(NaN)).toBeUndefined();
    expect(finitePositive(Infinity)).toBeUndefined();
    expect(finitePositive(-Infinity)).toBeUndefined();
  });

  it("returns undefined for non-number types", () => {
    expect(finitePositive("5")).toBeUndefined();
    expect(finitePositive(null)).toBeUndefined();
    expect(finitePositive(undefined)).toBeUndefined();
    expect(finitePositive({})).toBeUndefined();
  });
});

describe("module constants", () => {
  it("FIXED_PLOT_SAMPLE_COUNT is a positive integer", () => {
    expect(FIXED_PLOT_SAMPLE_COUNT).toBeGreaterThan(0);
    expect(Number.isInteger(FIXED_PLOT_SAMPLE_COUNT)).toBe(true);
  });

  it("FIXED_PLOT_MIN_HALF_WINDOW_SEC is a positive number in seconds", () => {
    expect(FIXED_PLOT_MIN_HALF_WINDOW_SEC).toBeGreaterThan(0);
    expect(Number.isFinite(FIXED_PLOT_MIN_HALF_WINDOW_SEC)).toBe(true);
    // must be at least 1 hour in seconds
    expect(FIXED_PLOT_MIN_HALF_WINDOW_SEC).toBeGreaterThanOrEqual(3600);
  });
});

describe("fallbackStepV3", () => {
  const minimalParams = {
    star: { radiusSolar: 1, massSolar: 1 },
    planet: { radiusJupiter: 1, massSolar: 0.001, orbit: { aSMA: 1, ecc: 0, inc: 0 } },
  } as never;

  it("creates a valid fallback with the given time", () => {
    const step = fallbackStepV3(42, minimalParams);
    expect(step.tObsSec).toBe(42);
  });

  it("flux defaults to 1.0 when no previous step provided", () => {
    const step = fallbackStepV3(0, minimalParams);
    expect(step.flux.total).toBe(1);
    expect(step.flux.transitFactor).toBe(1);
    expect(step.flux.stellarPreTransit).toBe(1);
  });

  it("includes 'fallback-step-used' uncertainty flag", () => {
    const step = fallbackStepV3(0, minimalParams);
    expect(step.renderSignals.uncertaintyFlags).toContain("fallback-step-used");
  });

  it("kinematics default to origin when no previous step", () => {
    const step = fallbackStepV3(0, minimalParams);
    expect(step.kinematics.planetSky).toEqual({ x: 0, y: 0, z: 0 });
    expect(step.kinematics.moonSky).toBeUndefined();
  });

  it("physics diagnostics indicate disabled convergence", () => {
    const step = fallbackStepV3(0, minimalParams);
    expect(step.physicsDiagnostics.ltteConvergence.status).toBe("disabled");
    expect(step.physicsDiagnostics.shapiroConvergence.status).toBe("disabled");
  });

  it("propagates previous step flux values when provided", () => {
    const prev = fallbackStepV3(0, minimalParams);
    prev.flux.total = 0.97;
    prev.flux.stellarPreTransit = 0.99;

    const step = fallbackStepV3(10, minimalParams, prev);
    expect(step.flux.total).toBe(0.97);
    expect(step.flux.stellarPreTransit).toBe(0.99);
  });

  it("propagates kinematics from previous step", () => {
    const prev = fallbackStepV3(0, minimalParams);
    prev.kinematics.planetSky = { x: 0.5, y: 0.2, z: 0 };

    const step = fallbackStepV3(10, minimalParams, prev);
    expect(step.kinematics.planetSky).toEqual({ x: 0.5, y: 0.2, z: 0 });
  });

  it("debug.displayFluxValue falls back to total flux", () => {
    const step = fallbackStepV3(0, minimalParams);
    expect(step.debug?.displayFluxValue).toBe(1);
  });

  it("close encounter flags list is initially empty", () => {
    const step = fallbackStepV3(0, minimalParams);
    expect(step.physicsDiagnostics.closeEncounterFlags).toEqual([]);
  });
});
