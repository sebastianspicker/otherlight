import { describe, expect, it } from "vitest";
import {
  applyAdaptiveHints,
  clearLearningProgressV3,
  evaluateRubricScore,
  loadLearningProgressV3,
  nextLearningProgress,
  pickActiveLessonStep,
  saveLearningProgressV3,
} from "../../src/didactics/v3";

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

describe("didactics v3", () => {
  it("evaluates weighted rubric scores", () => {
    const score = evaluateRubricScore({
      criteria: [
        { id: "c1", description: "impact parameter", weight: 2, passed: true },
        { id: "c2", description: "depth relation", weight: 1, passed: false },
      ],
    });

    expect(score).toBeCloseTo(2 / 3, 6);
  });

  it("generates adaptive hints for failed checks", () => {
    const hints = applyAdaptiveHints({
      enabled: true,
      strategy: "adaptive",
      maxHintsPerStep: 2,
      failedChecks: [
        { id: "b-low", label: "b_planet < 0.2" },
        { id: "depth-approx", label: "depth_obs ≈ depth_theory" },
      ],
    });

    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThanOrEqual(2);
  });

  it("advances learning state only when dependencies are satisfied", () => {
    const step = pickActiveLessonStep(
      {
        id: "lesson-1",
        title: "Lesson",
        steps: [
          { id: "s1", title: "Step 1", prompt: "do 1" },
          { id: "s2", title: "Step 2", prompt: "do 2", dependsOnStepIds: ["s1"] },
        ],
      },
      { lessonId: "lesson-1", stepIndex: 1, passedStepIds: [] },
    );

    const next = nextLearningProgress(
      { lessonId: "lesson-1", stepIndex: 1, passedStepIds: [] },
      { signals: { allChecksPassed: true, stepId: step.id } },
      { id: "lesson-1", title: "Lesson", steps: [step] },
    );

    expect(next.stepIndex).toBe(1);
    expect(next.passedStepIds).toEqual([]);
  });

  it("persists and restores learning progress with schema versioning", () => {
    const key = "didactics-progress-test";
    const storage = createMemoryStorage();
    const progress = {
      lessonId: "lesson-1",
      stepIndex: 2,
      passedStepIds: ["s1"],
      lastScore: 0.75,
      updatedAtSec: 100,
    };

    saveLearningProgressV3({ progress, storage, storageKey: key });
    const restored = loadLearningProgressV3({ storage, storageKey: key });

    expect(restored).toEqual(progress);

    clearLearningProgressV3({ storage, storageKey: key });
    expect(loadLearningProgressV3({ storage, storageKey: key })).toBeUndefined();
  });
});
