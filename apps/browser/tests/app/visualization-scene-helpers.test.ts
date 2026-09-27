/** Characterizes timing-badge thresholds, sign wording, and second rounding. */
import { describe, expect, it } from "vitest";

import type { SimulationFrame } from "../../src/domain/simulation/frames";
import { sceneTimingBadges } from "../../src/presentation/controllers/visualizationSceneHelpers";

function timingFrame(planetTransitCenterSec: number, moonTransitCenterSec: number): SimulationFrame {
  return { timing: { planetTransitCenterSec, moonTransitCenterSec } } as unknown as SimulationFrame;
}

describe("sceneTimingBadges", () => {
  it("omits offsets at the inclusive one-second threshold", () => {
    expect(sceneTimingBadges(timingFrame(0, 1))).toEqual([]);
    expect(sceneTimingBadges(timingFrame(0, -1))).toEqual([]);
  });

  it("preserves lead and trail wording with whole-second rounding", () => {
    expect(sceneTimingBadges(timingFrame(0, -1.5))).toEqual([
      { label: "moon leads by 2 s", color: "#ffd166" },
    ]);
    expect(sceneTimingBadges(timingFrame(0, 1.49))).toEqual([
      { label: "moon trails by 1 s", color: "#ffd166" },
    ]);
    expect(sceneTimingBadges(timingFrame(0, 1.5))).toEqual([
      { label: "moon trails by 2 s", color: "#ffd166" },
    ]);
  });
});
