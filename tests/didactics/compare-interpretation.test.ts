/** Verifies compare interpretation contracts supporting interpretable lesson flows. */

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

  it("adds lesson-aware wording and prompt context for exomoon labs", () => {
    const txt = interpretDidacticComparison(
      {
        tSec: 100,
        fluxTotalDelta: 5e-4,
        fluxTransitDelta: 3e-4,
        rvStarDelta: 0,
        rvPlanetDelta: 0,
      },
      {
        lessonId: "exomoon-transit-lab",
        comparisonPrompt: "Compare moon-on versus moon-off at the same timestamp.",
      },
    );

    expect(txt).toContain("moon or planet transit timing/geometry");
    expect(txt).toContain("Lesson prompt:");
    expect(txt).toContain("moon-on versus moon-off");
  });

  it("uses displayed-flux wording for binary eclipse lab comparisons", () => {
    const txt = interpretDidacticComparison(
      {
        tSec: 100,
        fluxTotalDelta: 1e-5,
        fluxDisplayDelta: 3e-4,
        fluxTransitDelta: 0,
        rvStarDelta: 0,
        rvPlanetDelta: 0,
      },
      { lessonId: "binary-eclipse-lab" },
    );

    expect(txt).toContain("ΔfluxDisplay");
    expect(txt).toContain("displayed binary eclipse depth changed");
  });
});
