import { expect, it } from "vitest";

import { computeForwardScatteringFlux } from "../../src/photometry/forwardScattering";

it("returns 0 when model is disabled", () => {
  const f = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 5 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: false, amp: 0.01 },
  });
  expect(f).toBe(0);
});

it("returns 0 when model is undefined", () => {
  const f = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 5 },
    observerDir: { x: 0, y: 0, z: 1 },
  });
  expect(f).toBe(0);
});

it("returns 0 when amplitude is 0", () => {
  const f = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 5 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 0 },
  });
  expect(f).toBe(0);
});

it("returns positive flux for HG model with body in front of observer", () => {
  const f = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 5 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 0.01, kind: "hg-angle", g: 0.8 },
  });
  expect(f).toBeGreaterThan(0);
  expect(Number.isFinite(f)).toBe(true);
});

it("returns 0 when body is behind the star (gateWhenBehindStar default)", () => {
  // Body at z=-5 means it is behind the star relative to observer along +Z.
  const f = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: -5 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 0.01, kind: "hg-angle", g: 0.8 },
  });
  expect(f).toBe(0);
});

it("HG flux peaks when body is aligned with observer direction (forward scattering)", () => {
  // Body exactly along observer direction => cosTheta ~ 1 => peak of HG
  const fAligned = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 10 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 1, kind: "hg-angle", g: 0.8 },
  });

  // Body at a large angle => cosTheta ~ 0 => lower HG value
  const fSide = computeForwardScatteringFlux({
    rBody: { x: 10, y: 0, z: 0.1 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 1, kind: "hg-angle", g: 0.8, gateWhenBehindStar: false },
  });

  expect(fAligned).toBeGreaterThan(fSide);
});

it("uses sigmaPhase as an angular-width control for the HG model", () => {
  const narrow = computeForwardScatteringFlux({
    rBody: { x: 1, y: 0, z: 1 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: {
      enabled: true,
      amp: 1,
      kind: "hg-angle",
      g: 0.8,
      sigmaPhase: 0.1,
      gateWhenBehindStar: false,
    },
  });
  const broad = computeForwardScatteringFlux({
    rBody: { x: 1, y: 0, z: 1 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: {
      enabled: true,
      amp: 1,
      kind: "hg-angle",
      g: 0.8,
      sigmaPhase: 1.2,
      gateWhenBehindStar: false,
    },
  });

  expect(broad).toBeGreaterThan(narrow);
});

it("gaussian-time model produces a peak at the specified phase", () => {
  const fAtCenter = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 5 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 1, kind: "gaussian-time", sigmaPhase: 0.1 },
    phase: 0,
  });
  const fAwayFromCenter = computeForwardScatteringFlux({
    rBody: { x: 0, y: 0, z: 5 },
    observerDir: { x: 0, y: 0, z: 1 },
    model: { enabled: true, amp: 1, kind: "gaussian-time", sigmaPhase: 0.1 },
    phase: 1.0,
  });
  expect(fAtCenter).toBeGreaterThan(fAwayFromCenter);
});
