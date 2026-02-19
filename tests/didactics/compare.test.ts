import { describe, expect, it } from "vitest";
import { cloneParams } from "../../src/app/scenario";
import { getPresetById } from "../../src/app/presets";
import { compareScenariosAtTime } from "../../src/didactics/compare";

describe("didactic A/B comparison", () => {
  it("returns finite deltas", () => {
    const a = cloneParams(getPresetById("default").params);
    const b = cloneParams(getPresetById("nbody-with-perturber").params);
    const cmp = compareScenariosAtTime(a, b, 0);

    expect(Number.isFinite(cmp.fluxTotalDelta)).toBe(true);
    expect(Number.isFinite(cmp.fluxTransitDelta)).toBe(true);
    expect(Number.isFinite(cmp.rvStarDelta ?? 0)).toBe(true);
  });
});
