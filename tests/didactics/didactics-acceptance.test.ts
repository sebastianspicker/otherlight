import { describe, expect, it } from "vitest";

import {
  canEditParams,
  canRevealSky,
  createBinaryLabState,
  revealSky,
  setHypothesis,
} from "../../src/didactics/binaryLab";

describe("didactics acceptance", () => {
  it("enforces hypothesis lock before reveal/edit", () => {
    let state = createBinaryLabState({
      hideSkyUntilReveal: true,
      requireHypothesis: true,
      lockParamsUntilHypothesis: true,
    });

    expect(canRevealSky(state)).toBe(false);
    expect(canEditParams(state)).toBe(false);

    state = setHypothesis(state, "primary-eclipse-deepest");
    expect(canRevealSky(state)).toBe(true);
    expect(canEditParams(state)).toBe(true);

    const revealed = revealSky(state);
    expect(revealed.skyVisible).toBe(true);
    expect(revealed.revealed).toBe(true);
  });
});
