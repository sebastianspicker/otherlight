/** Verifies rubric v2 contracts supporting interpretable lesson flows. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { computeDidacticSignals } from "../../src/didactics/engine";
import { stepSystem } from "../../src/sim/sim";

describe("didactics rubric v2", () => {
  it("computes rubricV2 score and breakdown when enabled", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = {
      enabled: true,
      activeLessonId: "kepler-geometry",
      autoAssess: true,
      assessmentRubricV2: {
        enabled: true,
        passScore: 0.6,
      },
    } as any;

    const step = stepSystem(p, 0);
    const sig = computeDidacticSignals(p, step);

    expect(sig?.rubricV2).toBeDefined();
    expect(Number.isFinite(sig?.rubricV2?.score)).toBe(true);
    expect((sig?.rubricV2?.breakdown.length ?? 0) > 0).toBe(true);
  });
});
