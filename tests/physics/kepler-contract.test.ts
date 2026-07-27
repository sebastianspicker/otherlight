/** Verifies kepler contract calculations in orbital dynamics and numerical integration. */

import { describe, expect, it } from "vitest";

import { solveKeplerE } from "../../src/physics/kepler";
import { stateFromResolvedElements } from "../../src/sim/orbits";

describe("Kepler fallback contract", () => {
  it("returns a finite wrapped best-effort value in non-strict mode", () => {
    const E = solveKeplerE(Math.PI / 3, 0.999999, { maxIters: 1, tol: 0, strict: false });

    expect(Number.isFinite(E)).toBe(true);
    expect(E).toBeGreaterThan(-Math.PI);
    expect(E).toBeLessThanOrEqual(Math.PI);
  });

  it("throws when the same non-converged solve is marked strict", () => {
    expect(() => solveKeplerE(Math.PI / 3, 0.999999, { maxIters: 1, tol: 0, strict: true })).toThrow(
      "did not converge",
    );
  });
});

describe("Cartesian Kepler state contract", () => {
  it("uses the same mass-derived mean motion for phase and velocity", () => {
    const a = 100;
    const mu = 25;
    const t0 = -4;
    const state = stateFromResolvedElements({ a, e: 0, inc: 0, Omega: 0, omega: 0, period: 999, t0 }, 0, mu);
    const meanMotion = Math.sqrt(mu / a) / a;
    const phase = meanMotion * -t0;

    expect(state.r.x).toBeCloseTo(a * Math.cos(phase), 12);
    expect(state.r.y).toBeCloseTo(a * Math.sin(phase), 12);
    expect(state.v.x).toBeCloseTo(-Math.sqrt(mu / a) * Math.sin(phase), 12);
    expect(state.v.y).toBeCloseTo(Math.sqrt(mu / a) * Math.cos(phase), 12);
  });
});
