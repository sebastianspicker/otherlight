import { describe, expect, it } from "vitest";
import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { StepResult } from "../../src/core/types";
import { computeDidacticSignals, resolveLearningState } from "../../src/didactics/engine";
import { getLessonById, getLessonStepPhases } from "../../src/didactics/lessons";
import { stepSystem } from "../../src/sim/sim";

describe("didactics engine", () => {
  it("emits didactic signals with checks and formulas when enabled", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = { enabled: true, activeLessonId: "kepler-geometry", autoAssess: true };
    const step = stepSystem(p, 0);
    const sig = computeDidacticSignals(p, step);

    expect(sig).toBeDefined();
    expect(sig?.lessonId).toBe("kepler-geometry");
    expect(sig?.lessonFamily).toBe("transit-geometry");
    expect(sig?.phaseType).toBe("worked-example");
    expect(sig?.workedExample?.title).toContain("central transit");
    expect((sig?.checks ?? []).length).toBeGreaterThan(0);
    expect((sig?.formulas ?? []).length).toBeGreaterThan(0);
  });

  it("emits lesson framing and interpretation for the exomoon lab", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = { enabled: true, activeLessonId: "exomoon-transit-lab", autoAssess: true };
    const step = stepSystem(p, 0);
    const sig = computeDidacticSignals(p, step);

    expect(sig?.lessonId).toBe("exomoon-transit-lab");
    expect(sig?.focusControls).toContain("quickMoonInc");
    expect(sig?.eventTargets).toContain("moonMidTransit");
    expect(sig?.phaseType).toBe("worked-example");
    expect(sig?.workedExample?.takeaway).toContain("front-of-star geometry");
    expect(sig?.interpretation?.headline).toBeTruthy();
    expect(sig?.comparisonPrompt).toContain("moon-on");
  });

  it("uses the shared display-flux diagnostic for binary combined eclipse depth", () => {
    const system = buildBinaryLabParams();
    const step: StepResult = {
      fluxTotal: 5,
      fluxTransitFactor: 1,
      planetSky: { x: 0, y: 0, z: 1 },
      meta: {
        t: 0,
        baselineFluxUsed: 5,
        displayFluxValue: 0.98,
        bPlanet: 0.2,
      },
    };

    const signals = computeDidacticSignals(system, step);
    const combinedDepth = signals?.formulas?.find((f) => f.id === "combined-flux-drop")?.value;

    expect(signals?.lessonId).toBe("binary-eclipse-lab");
    expect(combinedDepth).toBeCloseTo(0.02, 12);
    expect(signals?.interpretation?.headline).toContain("readable stellar eclipse");
  });

  it("reuses a valid learning state without cloning it again", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = {
      enabled: true,
      activeLessonId: "kepler-geometry",
      autoAssess: true,
      learningState: {
        lessonId: "kepler-geometry",
        stepIndex: 0,
        phaseIndex: 0,
        passedStepIds: ["kepler-step-1"],
        updatedAtSec: 12,
      },
    };

    const resolved = resolveLearningState(p, 42);

    expect(resolved).toBe(p.didactics.learningState);
  });

  it("still clamps out-of-range learning state to the current lesson bounds", () => {
    const p = cloneParams(SCENARIO_DEFAULTS);
    p.didactics = {
      enabled: true,
      activeLessonId: "kepler-geometry",
      autoAssess: true,
      learningState: {
        lessonId: "kepler-geometry",
        stepIndex: 99,
        phaseIndex: 99,
        passedStepIds: ["kepler-step-1"],
        updatedAtSec: 12,
      },
    };

    const resolved = resolveLearningState(p, 42);
    const lesson = getLessonById("kepler-geometry");
    expect(lesson).toBeDefined();
    const safeLesson = lesson!;
    const lastStepIndex = safeLesson.steps.length - 1;
    const lastPhaseIndex = getLessonStepPhases(safeLesson, lastStepIndex).length - 1;

    expect(resolved).not.toBe(p.didactics.learningState);
    expect(resolved.stepIndex).toBe(lastStepIndex);
    expect(resolved.phaseIndex).toBe(lastPhaseIndex);
    expect(resolved.passedStepIds).toEqual(["kepler-step-1"]);
  });
});
