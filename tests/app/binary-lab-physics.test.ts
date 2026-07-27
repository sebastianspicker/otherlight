/** Verifies binary lab physics contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";

import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { G_SI } from "../../src/core/units";

describe("binary lab orbital contract", () => {
  it("derives the period from semimajor axis and both stellar masses", () => {
    const orbit = DEFAULT_BINARY_LAB_CONFIG_V4.orbits.binary;
    const [primary, secondary] = DEFAULT_BINARY_LAB_CONFIG_V4.bodies.stars;
    const expectedPeriod =
      2 * Math.PI * Math.sqrt(orbit.a ** 3 / (G_SI * ((primary.m as number) + (secondary.m as number))));

    expect(orbit.period).toBeCloseTo(expectedPeriod, 12);
  });

  it("preserves the curated eclipse phase after deriving the period", () => {
    const orbit = DEFAULT_BINARY_LAB_CONFIG_V4.orbits.binary;
    const curatedPhase = 186_278.4 / (9.6 * 86_400);

    expect(-orbit.t0 / orbit.period).toBeCloseTo(curatedPhase, 12);
  });
});
