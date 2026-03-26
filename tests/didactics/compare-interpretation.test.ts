import { describe, expect, it } from "vitest";

import { interpretDidacticComparison } from "../../src/didactics/compare";

describe("didactic comparison interpretation", () => {
  it("returns a human-readable interpretation block", () => {
    const txt = interpretDidacticComparison({
      tSec: 100,
      fluxTotalDelta: 2e-3,
      fluxTransitDelta: 1e-3,
      rvStarDelta: 0.1,
      rvPlanetDelta: 0.2,
    });

    expect(txt).toContain("ΔfluxTotal");
    expect(txt).toContain("Interpretation:");
    expect(txt).toContain("Dynamics note");
  });
});
