import { describe, expect, it } from "vitest";

import { solveKeplerE } from "../../src/physics/kepler";

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
