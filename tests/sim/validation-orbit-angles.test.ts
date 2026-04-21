import { describe, expect, it } from "vitest";

import { assertOrbit } from "../../src/sim/validation";

describe("assertOrbit angle domains", () => {
  it("rejects inclinations outside [0, pi]", () => {
    expect(() =>
      assertOrbit({ a: 1, e: 0, period: 1, inc: Math.PI + 0.01, Omega: 0, omega: 0, t0: 0 }, "planet.orbit"),
    ).toThrow(/inc/i);
  });

  it("rejects degree-like inclinations passed as radians", () => {
    expect(() =>
      assertOrbit({ a: 1, e: 0, period: 1, inc: 90, Omega: 0, omega: 0, t0: 0 }, "planet.orbit"),
    ).toThrow(/rad|inc|degree/i);
  });
});
