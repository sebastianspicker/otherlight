import { describe, expect, it } from "vitest";
import { buildBinaryLabParams } from "../../src/app/binaryLab";
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

  it("reports a finite displayed-flux delta for binary lab comparisons", () => {
    const a = buildBinaryLabParams();
    const b = buildBinaryLabParams();
    const secondary = b.binaryStars?.secondary;
    expect(secondary).toBeDefined();
    if (!secondary) throw new Error("binary lab params must include a secondary star");
    secondary.passband = "r";

    const cmp = compareScenariosAtTime(a, b, 0);

    expect(Number.isFinite(cmp.fluxDisplayDelta ?? Number.NaN)).toBe(true);
  });
});
