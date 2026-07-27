/** Verifies relativity sign calculations in orbital dynamics and numerical integration. */

import { describe, expect, it } from "vitest";

import { lightTimeDelaySec, solveLightTimeCorrectedTime } from "../../src/physics/relativity";

describe("relativity sign convention (observerDir: star -> observer)", () => {
  it("returns negative Roemer delay for bodies in front of the star", () => {
    const c = 3e8;
    const delay = lightTimeDelaySec({ x: 0, y: 0, z: 3e8 }, { x: 0, y: 0, z: 1 }, c);
    expect(delay).toBeCloseTo(-1, 12);
  });

  it("yields a later emission time for in-front bodies under LTTE", () => {
    const c = 3e8;
    const tObs = 100;
    const tEmit = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: () => ({ x: 0, y: 0, z: 3e8 }),
      observerDir: { x: 0, y: 0, z: 1 },
      c,
      maxIters: 3,
      tolSec: 0,
    });

    expect(tEmit).toBeGreaterThan(tObs);
    expect(tEmit).toBeCloseTo(101, 12);
  });

  it("supports enhanced multi-body Shapiro contributions in the LTTE solver", () => {
    const c = 299_792_458;
    const tObs = 10_000;
    const mu = 1.3271244e20;
    const r = { x: 0, y: 0, z: 1.5e11 };

    const toy = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: () => r,
      observerDir: { x: 0, y: 0, z: 1 },
      c,
      shapiro: { enabled: true, mu },
      maxIters: 3,
      tolSec: 0,
    });

    const enhanced = solveLightTimeCorrectedTime({
      tObs,
      rAtTime: () => r,
      observerDir: { x: 0, y: 0, z: 1 },
      c,
      shapiro: {
        enabled: true,
        massesAtTime: () => [
          { mu, r: { x: 0, y: 0, z: 0 } },
          { mu: 1e17, r: { x: 0, y: 0, z: 1e10 } },
        ],
      },
      maxIters: 3,
      tolSec: 0,
    });

    expect(Number.isFinite(enhanced)).toBe(true);
    expect(Math.abs(enhanced - toy)).toBeGreaterThan(0);
  });
});
