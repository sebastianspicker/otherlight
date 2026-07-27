/** Verifies hint levels contracts supporting interpretable lesson flows. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { computeDidacticSignals } from "../../src/didactics/engine";
import type { StepResult } from "../../src/core/types";

describe("didactic hint levels", () => {
  it("emits leveled hints and misconception checks when checks fail", () => {
    const system = cloneParams(SCENARIO_DEFAULTS);
    system.didactics = {
      enabled: true,
      activeLessonId: "kepler-geometry",
      autoAssess: true,
      hintLevel: "L3",
      misconceptionChecks: { enabled: true },
    } as any;

    const step: StepResult = {
      fluxTotal: 1,
      fluxTransitFactor: 1,
      planetSky: { x: 0, y: Number.NaN, z: 1 },
      meta: { t: 0, bPlanet: Number.NaN },
    };

    const signals = computeDidacticSignals(system, step);
    expect(signals).toBeDefined();
    expect(signals?.hintLevels?.L1?.length).toBeGreaterThan(0);
    expect(signals?.hintLevels?.L2?.length).toBeGreaterThan(0);
    expect(signals?.hintLevels?.L3?.length).toBeGreaterThan(0);
    expect(Array.isArray(signals?.misconceptions)).toBe(true);
  });
});
