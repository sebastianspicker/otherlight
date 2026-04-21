import { describe, expect, it } from "vitest";

import { posFromResolvedElements } from "../../src/sim/orbits";

describe("orbit strict Kepler contract", () => {
  const hardOrbit = {
    a: 1.4e10,
    e: 0.999999,
    inc: 1.2,
    Omega: 0,
    omega: 0.1,
    period: 8.0e5,
    t0: 0,
  };

  it("returns a finite position with default best-effort Kepler solving", () => {
    const out = posFromResolvedElements(hardOrbit, hardOrbit.period / 6, "orbit.strict");

    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
  });

  it("throws when the same orbit solve is forced through strict Kepler semantics", () => {
    expect(() =>
      posFromResolvedElements(hardOrbit, hardOrbit.period / 6, "orbit.strict", {
        maxIters: 1,
        tol: 0,
        strict: true,
      }),
    ).toThrow("did not converge");
  });
});
