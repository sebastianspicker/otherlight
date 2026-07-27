/** Verifies random calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import { createMulberry32, normal, ouStep, poisson, randomWalkStep } from "../../src/photometry/random";

describe("photometry random helpers", () => {
  it("replays the same generator stream from a saved state", () => {
    const rng = createMulberry32(999);
    const state = rng.getState();
    const first = rng.u32();
    const second = rng.u32();

    rng.setState(state);

    expect(rng.u32()).toBe(first);
    expect(rng.u32()).toBe(second);
  });

  it("keeps scalar draws finite and in their expected domains", () => {
    const rng = createMulberry32(42);

    expect(rng.u01()).toBeGreaterThanOrEqual(0);
    expect(rng.u01()).toBeLessThan(1);
    expect(Number.isFinite(normal(rng, 2, 0.5))).toBe(true);
    expect(poisson(rng, 4)).toBeGreaterThanOrEqual(0);
  });

  it("advances correlated noise steps deterministically from the seed", () => {
    const a = createMulberry32(7);
    const b = createMulberry32(7);

    expect(ouStep(a, 0.1, 2, 50, 1e-3)).toBe(ouStep(b, 0.1, 2, 50, 1e-3));
    expect(randomWalkStep(a, 0.2, 2, 1e-3)).toBe(randomWalkStep(b, 0.2, 2, 1e-3));
  });
});
