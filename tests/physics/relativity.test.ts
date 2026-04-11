import { describe, expect, it } from "vitest";

import {
  lightTimeDelaySec,
  shapiroDelaySec,
  normalizeRelativityParams,
  grPrecessionPerOrbit,
  solveLightTimeCorrectedResult,
} from "../../src/physics/relativity";

describe("lightTimeDelaySec", () => {
  it("returns correct LTTE for a body in front of the observer", () => {
    // Body at z=+10, observer along +Z, c=1 => delay = -dot((0,0,10),(0,0,1))/1 = -10
    // (negative means the light arrives sooner because the body is closer)
    const delay = lightTimeDelaySec({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, 1);
    expect(delay).toBeCloseTo(-10, 10);
  });

  it("returns correct LTTE for a body behind the observer", () => {
    // Body at z=-10, observer along +Z, c=1 => delay = -dot((0,0,-10),(0,0,1))/1 = 10
    const delay = lightTimeDelaySec({ x: 0, y: 0, z: -10 }, { x: 0, y: 0, z: 1 }, 1);
    expect(delay).toBeCloseTo(10, 10);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(lightTimeDelaySec({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1)).toBe(0);
    expect(lightTimeDelaySec({ x: 0, y: 0, z: 10 }, { x: NaN, y: 0, z: 0 }, 1)).toBe(0);
  });

  it("returns 0 for non-positive c", () => {
    expect(lightTimeDelaySec({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, 0)).toBe(0);
    expect(lightTimeDelaySec({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 1 }, -1)).toBe(0);
  });

  it("scales linearly with 1/c", () => {
    const d1 = lightTimeDelaySec({ x: 0, y: 0, z: -100 }, { x: 0, y: 0, z: 1 }, 10);
    const d2 = lightTimeDelaySec({ x: 0, y: 0, z: -100 }, { x: 0, y: 0, z: 1 }, 20);
    expect(d1).toBeCloseTo(2 * d2, 10);
  });
});

describe("shapiroDelaySec", () => {
  it("returns a positive delay for a body in front of the gravitating center", () => {
    const delay = shapiroDelaySec({
      r: { x: 0, y: 0, z: 10 },
      observerDir: { x: 0, y: 0, z: 1 },
      mu: 1e10,
      c: 3e8,
    });
    expect(Number.isFinite(delay)).toBe(true);
    // The delay should be non-negative for a standard configuration
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 for non-positive mu", () => {
    expect(
      shapiroDelaySec({
        r: { x: 0, y: 0, z: 10 },
        observerDir: { x: 0, y: 0, z: 1 },
        mu: 0,
        c: 3e8,
      }),
    ).toBe(0);
  });

  it("returns 0 for non-finite r", () => {
    expect(
      shapiroDelaySec({
        r: { x: NaN, y: 0, z: 0 },
        observerDir: { x: 0, y: 0, z: 1 },
        mu: 1e10,
        c: 3e8,
      }),
    ).toBe(0);
  });

  it("returns 0 for zero-length r", () => {
    expect(
      shapiroDelaySec({
        r: { x: 0, y: 0, z: 0 },
        observerDir: { x: 0, y: 0, z: 1 },
        mu: 1e10,
        c: 3e8,
      }),
    ).toBe(0);
  });

  it("increases with larger mu", () => {
    const d1 = shapiroDelaySec({
      r: { x: 0, y: 1, z: 10 },
      observerDir: { x: 0, y: 0, z: 1 },
      mu: 1e10,
      c: 3e8,
    });
    const d2 = shapiroDelaySec({
      r: { x: 0, y: 1, z: 10 },
      observerDir: { x: 0, y: 0, z: 1 },
      mu: 2e10,
      c: 3e8,
    });
    expect(d2).toBeGreaterThan(d1);
  });
});

describe("normalizeRelativityParams", () => {
  it("returns all-disabled defaults for undefined input", () => {
    const n = normalizeRelativityParams(undefined);
    expect(n.enabled).toBe(false);
    expect(n.ltte).toBe(false);
    expect(n.grPrecession).toBe(false);
    expect(n.shapiro).toBe(false);
    expect(n.c).toBe(299_792_458);
  });

  it("enables sub-features when enabled=true and defaults are used", () => {
    const n = normalizeRelativityParams({ enabled: true });
    expect(n.enabled).toBe(true);
    expect(n.ltte).toBe(true);
    expect(n.grPrecession).toBe(true);
    expect(n.shapiro).toBe(true);
  });

  it("respects explicit sub-feature overrides", () => {
    const n = normalizeRelativityParams({ enabled: true, ltte: false, shapiro: false });
    expect(n.ltte).toBe(false);
    expect(n.grPrecession).toBe(true);
    expect(n.shapiro).toBe(false);
  });

  it("uses default c when an invalid value is provided", () => {
    const n = normalizeRelativityParams({ enabled: true, c: -1 });
    expect(n.c).toBe(299_792_458);
  });
});

describe("grPrecessionPerOrbit", () => {
  it("returns a positive precession for valid orbital parameters", () => {
    const dOmega = grPrecessionPerOrbit({ mu: 1.327e20, a: 5.79e10, e: 0.2056, c: 3e8 });
    expect(dOmega).toBeGreaterThan(0);
    expect(Number.isFinite(dOmega)).toBe(true);
  });

  it("returns 0 for eccentricity >= 1", () => {
    expect(grPrecessionPerOrbit({ mu: 1e20, a: 1e11, e: 1, c: 3e8 })).toBe(0);
  });

  it("returns 0 for non-positive a", () => {
    expect(grPrecessionPerOrbit({ mu: 1e20, a: 0, e: 0.1, c: 3e8 })).toBe(0);
    expect(grPrecessionPerOrbit({ mu: 1e20, a: -1, e: 0.1, c: 3e8 })).toBe(0);
  });

  it("returns 0 for non-positive c", () => {
    expect(grPrecessionPerOrbit({ mu: 1e20, a: 1e11, e: 0.1, c: 0 })).toBe(0);
  });
});

describe("solveLightTimeCorrectedResult", () => {
  it("reports convergence metadata for a constant-position LTTE solve", () => {
    const out = solveLightTimeCorrectedResult({
      tObs: 100,
      rAtTime: () => ({ x: 0, y: 0, z: 3e8 }),
      observerDir: { x: 0, y: 0, z: 1 },
      c: 3e8,
      maxIters: 4,
      tolSec: 0,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.converged).toBe(true);
    expect(out.diagnostics.iterations).toBeGreaterThanOrEqual(1);
    expect(out.diagnostics.usedShapiro).toBe(false);
    expect(out.diagnostics.validityFlags).toEqual([]);
    expect(out.diagnostics.residualSec).toBeDefined();
    expect(out.diagnostics.residualSec).toBeLessThanOrEqual(out.diagnostics.tolSec);
    expect(out.tEmit).toBeCloseTo(101, 12);
  });

  it("reports max-iters when the fixed-point LTTE solve does not converge within the budget", () => {
    const out = solveLightTimeCorrectedResult({
      tObs: 1,
      rAtTime: (t) => ({ x: 0, y: 0, z: t }),
      observerDir: { x: 0, y: 0, z: 1 },
      c: 2,
      maxIters: 1,
      tolSec: 0,
    });

    expect(out.diagnostics.status).toBe("max-iters");
    expect(out.diagnostics.converged).toBe(false);
    expect(out.diagnostics.iterations).toBe(1);
    expect(out.diagnostics.maxIters).toBe(1);
    expect(out.diagnostics.residualSec).toBeGreaterThan(out.diagnostics.tolSec);
    expect(out.diagnostics.validityFlags).toContain("residual-exceeds-tolerance");
    expect(out.tEmit).toBeCloseTo(1.5, 12);
  });

  it("matches the closed-form constant-velocity LTTE reference solution", () => {
    const tObs = 100;
    const z0 = 30;
    const vz = 0.2;
    const c = 2;
    const expected = (tObs + z0 / c) / (1 - vz / c);
    const out = solveLightTimeCorrectedResult({
      tObs,
      rAtTime: (t) => ({ x: 0, y: 0, z: z0 + vz * t }),
      observerDir: { x: 0, y: 0, z: 1 },
      c,
      maxIters: 16,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.residualSec).toBeLessThanOrEqual(1e-12);
    expect(out.tEmit).toBeCloseTo(expected, 10);
  });

  it("matches the static LTTE plus Shapiro reference delay", () => {
    const tObs = 10_000;
    const r = { x: 0, y: 0, z: 1.5e11 };
    const observerDir = { x: 0, y: 0, z: 1 };
    const c = 299_792_458;
    const mu = 1.3271244e20;
    const expected =
      tObs - (lightTimeDelaySec(r, observerDir, c) + shapiroDelaySec({ r, observerDir, mu, c }));
    const out = solveLightTimeCorrectedResult({
      tObs,
      rAtTime: () => r,
      observerDir,
      c,
      shapiro: {
        enabled: true,
        mu,
      },
      maxIters: 8,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.residualSec).toBeLessThanOrEqual(1e-12);
    expect(out.tEmit).toBeCloseTo(expected, 10);
  });

  it("emits explicit validity flags for the weak-field relative Shapiro models", () => {
    const out = solveLightTimeCorrectedResult({
      tObs: 10_000,
      rAtTime: () => ({ x: 0, y: 0, z: 1.5e11 }),
      observerDir: { x: 0, y: 0, z: 1 },
      c: 299_792_458,
      shapiro: {
        enabled: true,
        massesAtTime: () => [
          { mu: 1.3271244e20, r: { x: 0, y: 0, z: 0 } },
          { mu: 1e17, r: { x: 0, y: 0, z: 1e10 } },
        ],
      },
      maxIters: 3,
      tolSec: 0,
    });

    expect(out.diagnostics.validityFlags).toContain("relative-shapiro-delay");
    expect(out.diagnostics.validityFlags).toContain("weak-field-multi-body-shapiro-sum");
  });

  it("emits explicit solver-policy flags for implicit weak LTTE budgets and unregularized Shapiro impact", () => {
    const out = solveLightTimeCorrectedResult({
      tObs: 1_000,
      rAtTime: () => ({ x: 0, y: 0, z: 1.5e11 }),
      observerDir: { x: 0, y: 0, z: 1 },
      c: 299_792_458,
      shapiro: {
        enabled: true,
        mu: 1.3271244e20,
      },
    });

    expect(out.diagnostics.validityFlags).toContain("implicit-ltte-iteration-budget");
    expect(out.diagnostics.validityFlags).toContain("implicit-ltte-tolerance");
    expect(out.diagnostics.validityFlags).toContain("weak-ltte-iteration-budget");
    expect(out.diagnostics.validityFlags).toContain("single-point-mass-shapiro");
    expect(out.diagnostics.validityFlags).toContain("unregularized-shapiro-impact");
  });

  it("does not emit weak or implicit solver-policy flags for an explicit stronger LTTE solve", () => {
    const out = solveLightTimeCorrectedResult({
      tObs: 1_000,
      rAtTime: () => ({ x: 0, y: 0, z: 1.5e11 }),
      observerDir: { x: 0, y: 0, z: 1 },
      c: 299_792_458,
      shapiro: {
        enabled: true,
        mu: 1.3271244e20,
        minImpact: 10,
      },
      maxIters: 8,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.validityFlags).not.toContain("implicit-ltte-iteration-budget");
    expect(out.diagnostics.validityFlags).not.toContain("implicit-ltte-tolerance");
    expect(out.diagnostics.validityFlags).not.toContain("weak-ltte-iteration-budget");
    expect(out.diagnostics.validityFlags).not.toContain("unregularized-shapiro-impact");
  });

  it("emits a regime flag when the Shapiro impact floor is actually engaged by the geometry", () => {
    const out = solveLightTimeCorrectedResult({
      tObs: 1_000,
      rAtTime: () => ({ x: 0.01, y: 0, z: -10 }),
      observerDir: { x: 0, y: 0, z: 1 },
      c: 299_792_458,
      shapiro: {
        enabled: true,
        mu: 1.3271244e20,
        minImpact: 1,
      },
      maxIters: 8,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.validityFlags).toContain("shapiro-impact-floor-engaged");
    expect(out.diagnostics.validityFlags).not.toContain("unregularized-shapiro-impact");
  });
});
