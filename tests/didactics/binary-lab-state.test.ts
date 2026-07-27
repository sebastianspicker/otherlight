/** Verifies binary lab state contracts supporting interpretable lesson flows. */

import { describe, expect, it } from "vitest";

import {
  createBinaryLabState,
  canEditParams,
  canRevealSky,
  setHypothesis,
  revealSky,
  type BinaryLabHypothesis,
} from "../../src/didactics/binaryLab";

describe("binary lab didactic state", () => {
  it("enforces hypothesis before reveal and parameter edits when required", () => {
    const s0 = createBinaryLabState({
      hideSkyUntilReveal: true,
      requireHypothesis: true,
      lockParamsUntilHypothesis: true,
    });

    expect(s0.skyVisible).toBe(false);
    expect(canRevealSky(s0)).toBe(false);
    expect(canEditParams(s0)).toBe(false);

    const s1 = setHypothesis(s0, "secondary-eclipse-dominates");

    expect(canRevealSky(s1)).toBe(true);
    expect(canEditParams(s1)).toBe(true);

    const s2 = revealSky(s1);
    expect(s2.skyVisible).toBe(true);
  });

  it("allows free interaction when requirements are disabled", () => {
    const s0 = createBinaryLabState({
      hideSkyUntilReveal: false,
      requireHypothesis: false,
      lockParamsUntilHypothesis: false,
    });

    expect(s0.skyVisible).toBe(true);
    expect(canRevealSky(s0)).toBe(true);
    expect(canEditParams(s0)).toBe(true);

    const s1 = setHypothesis(s0, "primary-eclipse-deepest");
    expect(s1.hypothesis).toBe("primary-eclipse-deepest" as BinaryLabHypothesis);
  });
});
