import { describe, expect, it } from "vitest";

import { buildLessonReportMarkdown } from "../../src/didactics/report";

describe("lesson report markdown", () => {
  it("includes lesson phase, learner responses, and comparison output", () => {
    const markdown = buildLessonReportMarkdown({
      courseTitle: "Guided Lab",
      state: {
        lessonId: "binary-eclipse-lab",
        stepIndex: 1,
        phaseIndex: 2,
        passedStepIds: ["binary-step-1"],
        lastScore: 0.8,
      },
      latestSignals: {
        lessonId: "binary-eclipse-lab",
        lessonTitle: "Binary Eclipse Lab",
        lessonFamily: "binary-inference",
        signalSurface: "physical",
        recommendedUiMode: "normal",
        lessonSummary: "Infer the hidden binary from the combined light curve.",
        teachingGoal: "Connect black-box inference to the revealed geometry.",
        phaseTitle: "Reveal the sky and revise the model",
        phaseType: "explain",
        phasePrompt: "Explain what the reveal changed in your model.",
        interpretation: {
          headline: "Your initial model needs revision.",
          observation: "The revealed eclipse chord is more grazing than expected.",
          nextAction: "Relate the deeper eclipse to both geometry and luminosity contrast.",
        },
      },
      latestComparison: {
        tSec: 120,
        fluxTotalDelta: 1e-5,
        fluxDisplayDelta: 3e-4,
        fluxTransitDelta: 0,
        rvStarDelta: 0,
        rvPlanetDelta: 0,
      },
      responses: {
        "binary-eclipse-lab:binary-step-1:binary-step-1-predict": {
          primary: "I predict the primary eclipse is deepest.",
          secondary: "Because the brighter star should lose more light when eclipsed.",
        },
      },
      latestComparisonText: "Interpretation: The revealed system falsified the original hypothesis.",
    });

    expect(markdown).toContain("Lesson Family: binary-inference");
    expect(markdown).toContain("Phase: Reveal the sky and revise the model");
    expect(markdown).toContain("Learner Responses");
    expect(markdown).toContain("I predict the primary eclipse is deepest.");
    expect(markdown).toContain("A/B Comparison");
    expect(markdown).toContain("ΔfluxDisplay");
    expect(markdown).toContain("falsified the original hypothesis");
  });

  it("does not claim that no comparison was recorded when structured comparison metrics exist", () => {
    const markdown = buildLessonReportMarkdown({
      courseTitle: "Guided Lab",
      state: {
        lessonId: "binary-eclipse-lab",
        stepIndex: 1,
        phaseIndex: 2,
        passedStepIds: ["binary-step-1"],
        lastScore: 0.8,
      },
      latestComparison: {
        tSec: 120,
        fluxTotalDelta: 1e-5,
        fluxDisplayDelta: 3e-4,
        fluxTransitDelta: 0,
        rvStarDelta: 0,
        rvPlanetDelta: 0,
      },
    });

    expect(markdown).toContain("ΔfluxDisplay");
    expect(markdown).toContain("interpretation not recorded");
    expect(markdown).not.toContain("no comparison recorded");
  });
});
