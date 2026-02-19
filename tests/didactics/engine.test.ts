import { describe, expect, it } from "vitest";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { computeDidacticSignals } from "../../src/didactics/engine";
import { stepSystem } from "../../src/sim/sim";

describe("didactics engine", () => {
  it("emits didactic signals with checks and formulas when enabled", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = { enabled: true, activeLessonId: "kepler-geometry", autoAssess: true };
    const step = stepSystem(p, 0);
    const sig = computeDidacticSignals(p, step);

    expect(sig).toBeDefined();
    expect(sig?.lessonId).toBe("kepler-geometry");
    expect((sig?.checks ?? []).length).toBeGreaterThan(0);
    expect((sig?.formulas ?? []).length).toBeGreaterThan(0);
  });
});
