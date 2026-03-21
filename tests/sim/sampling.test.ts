import { describe, expect, it } from "vitest";

import { sampleOrbitSky } from "../../src/sim/sampling";
import type { OrbitElements } from "../../src/core/types";

const circularOrbit: OrbitElements = {
  a: 5,
  e: 0,
  inc: Math.PI / 2,
  Omega: 0,
  omega: 0,
  period: 1000,
  t0: 0,
};

describe("sampleOrbitSky", () => {
  it("returns the requested number of samples", () => {
    const pts = sampleOrbitSky(circularOrbit, 0, 64);
    expect(pts).toHaveLength(64);
  });

  it("enforces a minimum of 16 samples", () => {
    const pts = sampleOrbitSky(circularOrbit, 0, 1);
    expect(pts.length).toBeGreaterThanOrEqual(16);
  });

  it("all sample points are finite", () => {
    const pts = sampleOrbitSky(circularOrbit, 0, 32);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });

  it("samples lie on a circle of approximately the semi-major axis for a circular orbit", () => {
    const pts = sampleOrbitSky(circularOrbit, 0, 64);
    for (const p of pts) {
      const skyR = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      // For a circular orbit the distance from origin should be close to a=5.
      expect(skyR).toBeCloseTo(circularOrbit.a, 3);
    }
  });

  it("throws for non-finite tStart", () => {
    expect(() => sampleOrbitSky(circularOrbit, NaN, 32)).toThrow(/tStart/);
  });
});
