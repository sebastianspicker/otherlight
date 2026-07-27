/** Verifies phase curve calculations in the observable-light and transit model. */

import { expect, it } from "vitest";

import { bodyPhaseFlux } from "../../src/photometry/phaseCurve";

const observerDir = { x: 0, y: 0, z: 1 };

it("returns 0 when phase curve is disabled", () => {
  const f = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
    model: { enabled: false, reflAmp: 1e-3, thermAmp: 1e-3 },
  });
  expect(f).toBe(0);
});

it("returns 0 when model is undefined", () => {
  const f = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
  });
  expect(f).toBe(0);
});

it("reflected light is positive at full phase (alpha~0)", () => {
  // rBody at -z => body is behind the star from the observer's perspective,
  // meaning full phase (dayside facing observer), alpha ~ 0.
  const f = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
    model: { enabled: true, reflAmp: 1e-3, thermAmp: 0, physicalScaling: false },
  });
  expect(f).toBeGreaterThan(0);
  expect(Number.isFinite(f)).toBe(true);
});

it("reflected light is positive at quarter phase", () => {
  // rBody perpendicular to observer direction => alpha ~ pi/2 (quarter phase).
  const f = bodyPhaseFlux({
    rBody: { x: 10, y: 0, z: 0 },
    observerDir,
    model: { enabled: true, reflAmp: 1e-3, thermAmp: 0, lambertian: true, physicalScaling: false },
  });
  expect(f).toBeGreaterThan(0);
  expect(Number.isFinite(f)).toBe(true);
});

it("thermal emission is positive at full phase", () => {
  const f = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
    model: { enabled: true, reflAmp: 0, thermAmp: 1e-3, physicalScaling: false },
  });
  expect(f).toBeGreaterThan(0);
  expect(Number.isFinite(f)).toBe(true);
});

it("total flux is non-negative for arbitrary geometry", () => {
  const positions = [
    { x: 0, y: 0, z: -10 },
    { x: 10, y: 0, z: 0 },
    { x: 0, y: 0, z: 10 },
    { x: 5, y: 5, z: -5 },
  ];
  for (const rBody of positions) {
    const f = bodyPhaseFlux({
      rBody,
      observerDir,
      model: {
        enabled: true,
        reflAmp: 1e-3,
        thermAmp: 1e-3,
        constant: 1e-4,
        physicalScaling: false,
      },
    });
    expect(f).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(f)).toBe(true);
  }
});

it("total flux is bounded by sum of amplitudes (physicalScaling off)", () => {
  const reflAmp = 1e-3;
  const thermAmp = 2e-3;
  const constant = 5e-4;
  const f = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
    model: { enabled: true, reflAmp, thermAmp, constant, physicalScaling: false },
  });
  // With clamped weights in [0,1], total <= reflAmp + thermAmp + constant.
  expect(f).toBeLessThanOrEqual(reflAmp + thermAmp + constant + 1e-15);
});

it("Lambertian vs non-Lambertian produces different reflected flux at quarter phase", () => {
  const baseParams = {
    rBody: { x: 10, y: 0, z: 0 } as const,
    observerDir,
    model: { enabled: true, reflAmp: 1e-3, thermAmp: 0, physicalScaling: false },
  };

  const fLambert = bodyPhaseFlux({
    ...baseParams,
    model: { ...baseParams.model, lambertian: true },
  });

  const fCosine = bodyPhaseFlux({
    ...baseParams,
    model: { ...baseParams.model, lambertian: false },
  });

  // Both should be positive at quarter phase.
  expect(fLambert).toBeGreaterThan(0);
  expect(fCosine).toBeGreaterThan(0);
  // They should differ because the phase functions are different.
  expect(fLambert).not.toBeCloseTo(fCosine, 10);
});

it("returns 0 when all amplitudes are zero even if enabled", () => {
  const f = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
    model: { enabled: true, reflAmp: 0, thermAmp: 0, constant: 0 },
  });
  expect(f).toBe(0);
});
