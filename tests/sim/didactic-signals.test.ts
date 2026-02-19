import { describe, expect, it } from "vitest";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { stepSystem } from "../../src/sim/sim";

describe("step meta didactic and decomposition signals", () => {
  it("emits flux decomposition and didactic signals when enabled", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = { enabled: true, activeLessonId: "kepler-geometry", autoAssess: true };
    const step = stepSystem(p, 0);

    expect(step.meta?.fluxDecomposition).toBeDefined();
    expect(step.meta?.fluxDecomposition?.total).toBeDefined();
    expect(step.meta?.didacticSignals).toBeDefined();
    expect(step.meta?.didacticSignals?.checks?.length ?? 0).toBeGreaterThan(0);
  });
});
