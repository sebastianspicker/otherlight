import { describe, expect, it } from "vitest";

import {
  lightTimeDelaySec,
  shapiroDelaySec,
  normalizeRelativityParams,
  grPrecessionPerOrbit,
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
