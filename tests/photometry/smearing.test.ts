/** Verifies smearing calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import { boxcarAverageFlux, smearedFluxAt } from "../../src/photometry/smearing";

describe("smearing determinism", () => {
  it("boxcar average of a linear function equals the center value", () => {
    const f = (t: number) => 3 * t + 1;
    const out = boxcarAverageFlux(f, 10, 4, 9);
    expect(out).toBeCloseTo(f(10), 12);
  });

  it("is deterministic across repeated calls with the same inputs", () => {
    const f = (t: number) => Math.sin(t);
    const a = smearedFluxAt(f, 5, { cadenceSec: 2, nSubsamples: 5 });
    const b = smearedFluxAt(f, 5, { cadenceSec: 2, nSubsamples: 5 });
    expect(a).toBe(b);
  });

  it("falls back to instantaneous when all subsamples are non-finite (ignore policy)", () => {
    const f = (_t: number) => Number.NaN;
    const out = smearedFluxAt(f, 5, { cadenceSec: 2, nSubsamples: 5, nonFinitePolicy: "ignore" });
    expect(out).toBe(0);
  });
});
