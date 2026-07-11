// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from "vitest";
import type { DidacticsRuntimeState } from "../../src/app/didactics";
import { installAppShellDocument } from "../helpers/appShell";

function installDom(): void {
  installAppShellDocument();
}

function exomoonTeachingRuntime(): DidacticsRuntimeState {
  return {
    learning: {
      lessonId: "exomoon-transit-lab",
      stepIndex: 0,
      phaseIndex: 2,
      passedStepIds: [],
    },
    responses: {
      "exomoon-transit-lab:exomoon-step-1:exomoon-step-1-observe": {
        primary: "The moon crosses the stellar disk but still sits close to the planet path.",
      },
    },
    latestTiming: {
      planetIngressSec: -1200,
      planetTransitCenterSec: 0,
      planetEgressSec: 1200,
      moonIngressSec: -600,
      moonTransitCenterSec: 300,
      moonEgressSec: 900,
    },
    latestSignals: {
      lessonId: "exomoon-transit-lab",
      lessonTitle: "Exomoon Transit Lab",
      lessonFamily: "exomoon-signal",
      lessonSummary: "Separate the moon signal from the planet transit.",
      teachingGoal: "Teach moon lead/lag and front-of-star geometry.",
      signalSurface: "physical",
      recommendedUiMode: "normal",
      focusControls: ["quickMoonA", "quickMoonInc"],
      eventTargets: ["moonIngress", "moonMidTransit"],
      phaseId: "exomoon-step-1-observe",
      phaseType: "observe",
      phaseTitle: "Observe the moon geometry",
      phasePrompt: "Jump to the moon event and record whether the moon really crosses the stellar disk.",
      phaseChecklist: ["Does the moon path overlap the stellar disk?", "Is the moon in front of the star?"],
      responseMode: "observation-notes",
      responsePrimaryLabel: "Observation notes",
      responsePrimaryPlaceholder: "Describe what you observe.",
      learnerVocabulary: ["lead/lag", "moon dip"],
      prompt: "Adjust the moon spacing until the moon dip separates from the planet dip.",
      hints: ["fallback hint"],
      hintLevels: {
        L1: ["nudge"],
        L2: ["explanation"],
        L3: ["full solution"],
      },
      misconceptions: [
        { id: "moon-hidden", message: "A moon behind the star cannot dim it.", severity: "warn" },
      ],
      checks: [
        {
          id: "moon-lead-lag",
          label: "|Δt_moon-planet| >= 600 s",
          passed: false,
          observed: 120,
          expected: ">= 600 s",
          statusText: "The moon still overlaps the planet signal too closely.",
        },
      ],
      formulas: [
        {
          id: "moon-lag",
          title: "Moon lead/lag",
          latex: "Δt",
          value: 120,
          unit: "s",
        },
      ],
      interpretation: {
        headline: "The moon is still too close to the planet signal.",
        observation: "You have a visible moon path but not a cleanly separated dip yet.",
        nextAction: "Increase moon spacing or reduce moon inclination.",
      },
      score: 0.5,
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  installDom();
});

it("filters lesson options by simulation mode", async () => {
  const { uiRefs } = await import("../../src/ui/refs");
  const { populateDidacticsControls } = await import("../../src/app/didactics");

  populateDidacticsControls(uiRefs, "preset-lab");
  const presetLabels = Array.from(uiRefs.didLessonSelect?.options ?? []).map(
    (option) => option.textContent ?? "",
  );
  expect(presetLabels.some((label) => label.includes("Binary Eclipse Lab"))).toBe(false);
  expect(presetLabels.some((label) => label.includes("Exomoon Transit Lab"))).toBe(true);

  populateDidacticsControls(uiRefs, "binary-lab");
  const binaryLabels = Array.from(uiRefs.didLessonSelect?.options ?? []).map(
    (option) => option.textContent ?? "",
  );
  expect(binaryLabels).toHaveLength(1);
  expect(binaryLabels[0]).toContain("Binary Eclipse Lab");
});

it("renders interpretation, progressive hints, misconceptions, and lesson events", async () => {
  const { uiRefs } = await import("../../src/ui/refs");
  const { renderDidacticSignals } = await import("../../src/app/didactics");

  if (uiRefs.didHintLevelSelect) uiRefs.didHintLevelSelect.value = "L2";

  renderDidacticSignals(uiRefs, exomoonTeachingRuntime());

  expect(uiRefs.didPhaseTitle?.textContent).toContain("Observe the moon geometry");
  expect(uiRefs.didPhasePrompt?.textContent).toContain("Jump to the moon event");
  expect(uiRefs.didInterpretation?.textContent).toContain("still too close to the planet signal");
  expect(uiRefs.didObservationList?.textContent).toContain("stellar disk");
  expect(uiRefs.didPrimaryResponseInput?.value).toContain("moon crosses the stellar disk");
  expect(uiRefs.didHintList?.textContent).toContain("explanation");
  expect(uiRefs.didHintList?.textContent).not.toContain("full solution");
  expect(uiRefs.didMisconceptionList?.textContent).toContain("cannot dim it");
  expect(uiRefs.didFocusList?.textContent).toContain("Moon spacing");
  expect(uiRefs.didEventTargetSelect?.options).toHaveLength(2);
  expect(uiRefs.didEventTargetSelect?.textContent).toContain("Moon ingress");
  expect(
    document.querySelector('[data-quick-control="quickMoonA"]')?.classList.contains("quickControl--focus"),
  ).toBe(true);
  expect(
    document.querySelector('[data-quick-control="quickPlanetR"]')?.classList.contains("quickControl--dimmed"),
  ).toBe(true);
});

it("preserves the selected lesson event across rerenders when it remains valid", async () => {
  const { uiRefs } = await import("../../src/ui/refs");
  const { renderDidacticSignals } = await import("../../src/app/didactics");

  const runtime: DidacticsRuntimeState = {
    learning: {
      lessonId: "exomoon-transit-lab",
      stepIndex: 0,
      phaseIndex: 2,
      passedStepIds: [],
    },
    responses: {},
    latestTiming: {
      planetIngressSec: -1200,
      planetTransitCenterSec: 0,
      planetEgressSec: 1200,
      moonIngressSec: -600,
      moonTransitCenterSec: 300,
      moonEgressSec: 900,
    },
    latestSignals: {
      lessonId: "exomoon-transit-lab",
      lessonTitle: "Exomoon Transit Lab",
      lessonFamily: "exomoon-signal",
      lessonSummary: "Separate the moon signal from the planet transit.",
      teachingGoal: "Teach moon lead/lag and front-of-star geometry.",
      signalSurface: "physical",
      recommendedUiMode: "normal",
      focusControls: ["quickMoonA"],
      eventTargets: ["moonIngress", "moonMidTransit"],
      phaseId: "exomoon-step-1-observe",
      phaseType: "observe",
      phaseTitle: "Observe the moon geometry",
      phasePrompt: "Jump to the moon event and record whether the moon really crosses the stellar disk.",
      phaseChecklist: [],
      responseMode: "none",
      learnerVocabulary: [],
      prompt: "Observe the moon event.",
      hints: [],
      misconceptions: [],
      checks: [],
      formulas: [],
      score: 1,
    },
  };

  renderDidacticSignals(uiRefs, runtime);
  expect(uiRefs.didEventTargetSelect?.value).toBe("moonIngress");

  if (uiRefs.didEventTargetSelect) uiRefs.didEventTargetSelect.value = "moonMidTransit";
  renderDidacticSignals(uiRefs, runtime);

  expect(uiRefs.didEventTargetSelect?.value).toBe("moonMidTransit");
});

it("advances and retreats lesson phases while preserving keyed learner responses", async () => {
  const { advanceLessonFlow, initDidacticsRuntime, retreatLessonFlow, updateDidacticResponse } =
    await import("../../src/app/didactics");
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

  const system = cloneParams(SCENARIO_DEFAULTS);
  system.didactics = {
    enabled: true,
    activeLessonId: "kepler-geometry",
    autoAssess: true,
  };

  let runtime = initDidacticsRuntime(system, 0);
  runtime = updateDidacticResponse(runtime, { primary: "Central transit should deepen the dip." }, 0);
  runtime = advanceLessonFlow(system, runtime, 10);
  runtime = advanceLessonFlow(system, runtime, 20);

  expect(runtime.learning.phaseIndex).toBe(2);
  expect(Object.values(runtime.responses).some((entry) => entry.primary?.includes("Central transit"))).toBe(
    true,
  );

  runtime = retreatLessonFlow(system, runtime, 30);
  expect(runtime.learning.phaseIndex).toBe(1);
});

it("preserves responses and comparison state when switching lessons", async () => {
  const { initDidacticsRuntime, switchDidacticsLesson, updateDidacticComparison, updateDidacticResponse } =
    await import("../../src/app/didactics");
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

  const system = cloneParams(SCENARIO_DEFAULTS);
  system.didactics = {
    enabled: true,
    activeLessonId: "kepler-geometry",
    autoAssess: true,
  };

  let runtime = initDidacticsRuntime(system, 0);
  runtime = updateDidacticResponse(runtime, { primary: "Central transits are deeper." }, 0);
  runtime = updateDidacticComparison(
    runtime,
    {
      tSec: 120,
      fluxTotalDelta: 1e-5,
      fluxDisplayDelta: 3e-4,
      fluxTransitDelta: 0,
      rvStarDelta: 0,
      rvPlanetDelta: 0,
    },
    "Interpretation: The displayed eclipse depth changed.",
  );

  runtime = switchDidacticsLesson(system, runtime, "binary-eclipse-lab", 30, "binary-lab");

  expect(runtime.learning.lessonId).toBe("binary-eclipse-lab");
  expect(Object.values(runtime.responses).some((entry) => entry.primary?.includes("deeper"))).toBe(true);
  expect(runtime.latestComparisonText).toContain("displayed eclipse depth changed");
  expect(runtime.latestSignals).toBeUndefined();
  expect(runtime.latestTiming).toBeUndefined();
});

it("stores structured comparison data alongside the rendered comparison text", async () => {
  const { initDidacticsRuntime, updateDidacticComparison } = await import("../../src/app/didactics");
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

  const system = cloneParams(SCENARIO_DEFAULTS);
  let runtime = initDidacticsRuntime(system, 0);
  runtime = updateDidacticComparison(
    runtime,
    {
      tSec: 120,
      fluxTotalDelta: 1e-5,
      fluxDisplayDelta: 3e-4,
      fluxTransitDelta: 0,
      rvStarDelta: 0,
      rvPlanetDelta: 0,
    },
    "Interpretation: The displayed binary eclipse depth changed.",
  );

  expect(runtime.latestComparison?.fluxDisplayDelta).toBe(3e-4);
  expect(runtime.latestComparisonText).toContain("displayed binary eclipse depth changed");
});

it("updates didactic comparison state without depending on the compare output element", async () => {
  const { uiRefs } = await import("../../src/ui/refs");
  const { wireDidacticsUi } = await import("../../src/app/didacticsWiring");
  const { buildBinaryLabParams } = await import("../../src/app/binaryLab");
  const { ensureDidacticsConfig, initDidacticsRuntime } = await import("../../src/app/didactics");
  const { createBinaryLabState } = await import("../../src/didactics/binaryLab");

  const params = ensureDidacticsConfig(buildBinaryLabParams());
  const state = {
    params,
    didacticsRuntime: initDidacticsRuntime(params, 0),
    binaryLabState: createBinaryLabState(),
    t: 0,
  };

  wireDidacticsUi({
    refs: { ...uiRefs, didCompareOut: null },
    state,
    getSimulation: () =>
      ({
        step: () => {
          throw new Error("compare wiring test does not use getSimulation()");
        },
      }) as never,
    currentLessonSimMode: () => "binary-lab",
    seekToTime: () => undefined,
    syncBinaryUi: () => undefined,
    warnEl: null,
    getSuccessMessage: () => "ok",
  });

  expect(uiRefs.didCompareBtn).not.toBeNull();
  if (!uiRefs.didCompareBtn) throw new Error("compare button must exist in test DOM");

  uiRefs.didCompareBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(state.didacticsRuntime.latestComparison).toBeDefined();
  expect(Number.isFinite(state.didacticsRuntime.latestComparison?.fluxDisplayDelta ?? Number.NaN)).toBe(true);
  expect(state.didacticsRuntime.latestComparisonText).toContain("Interpretation:");
});

it("exports lesson reports with structured displayed-flux comparison metrics", async () => {
  const { exportDidacticReport } = await import("../../src/app/didactics");
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

  const system = cloneParams(SCENARIO_DEFAULTS);
  system.didactics = {
    ...(system.didactics ?? {}),
    enabled: true,
    activeLessonId: "binary-eclipse-lab",
  };

  const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:test");
  const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL");
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.useFakeTimers();

  try {
    exportDidacticReport(system, {
      learning: {
        lessonId: "binary-eclipse-lab",
        stepIndex: 1,
        phaseIndex: 2,
        passedStepIds: ["binary-step-1"],
        lastScore: 0.8,
      },
      responses: {},
      latestComparison: {
        tSec: 120,
        fluxTotalDelta: 1e-5,
        fluxDisplayDelta: 3e-4,
        fluxTransitDelta: 0,
        rvStarDelta: 0,
        rvPlanetDelta: 0,
      },
      latestComparisonText: "Interpretation: The displayed binary eclipse depth changed.",
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectUrlSpy.mock.calls[0] ?? [];
    expect(blobArg).toBeInstanceOf(Blob);
    const markdown = await (blobArg as Blob).text();

    expect(markdown).toContain("ΔfluxDisplay");
    expect(markdown).toContain("displayed binary eclipse depth changed");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const exportedAnchor = document.body.querySelector(
      'a[download="lesson-report-binary-eclipse-lab.md"]',
    ) as HTMLAnchorElement | null;
    expect(exportedAnchor).toBeNull();

    vi.runAllTimers();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:test");
  } finally {
    vi.useRealTimers();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  }
});

it("exports structured comparison metrics even when no interpretation string was recorded", async () => {
  const { exportDidacticReport } = await import("../../src/app/didactics");
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

  const system = cloneParams(SCENARIO_DEFAULTS);
  system.didactics = {
    ...(system.didactics ?? {}),
    enabled: true,
    activeLessonId: "binary-eclipse-lab",
  };

  const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:test");
  const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL");
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.useFakeTimers();

  try {
    exportDidacticReport(system, {
      learning: {
        lessonId: "binary-eclipse-lab",
        stepIndex: 1,
        phaseIndex: 2,
        passedStepIds: ["binary-step-1"],
        lastScore: 0.8,
      },
      responses: {},
      latestComparison: {
        tSec: 120,
        fluxTotalDelta: 1e-5,
        fluxDisplayDelta: 3e-4,
        fluxTransitDelta: 0,
        rvStarDelta: 0,
        rvPlanetDelta: 0,
      },
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectUrlSpy.mock.calls[0] ?? [];
    expect(blobArg).toBeInstanceOf(Blob);
    const markdown = await (blobArg as Blob).text();

    expect(markdown).toContain("ΔfluxDisplay");
    expect(markdown).toContain("interpretation not recorded");
    expect(markdown).not.toContain("no comparison recorded");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:test");
  } finally {
    vi.useRealTimers();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  }
});

it("exports the no-comparison state when no comparison was recorded", async () => {
  const { exportDidacticReport } = await import("../../src/app/didactics");
  const { cloneParams, SCENARIO_DEFAULTS } = await import("../../src/app/scenario");

  const system = cloneParams(SCENARIO_DEFAULTS);
  system.didactics = {
    ...(system.didactics ?? {}),
    enabled: true,
    activeLessonId: "binary-eclipse-lab",
  };

  const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:test");
  const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL");
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.useFakeTimers();

  try {
    exportDidacticReport(system, {
      learning: {
        lessonId: "binary-eclipse-lab",
        stepIndex: 1,
        phaseIndex: 2,
        passedStepIds: ["binary-step-1"],
        lastScore: 0.8,
      },
      responses: {},
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectUrlSpy.mock.calls[0] ?? [];
    expect(blobArg).toBeInstanceOf(Blob);
    const markdown = await (blobArg as Blob).text();

    expect(markdown).toContain("A/B Comparison");
    expect(markdown).toContain("no comparison recorded");
    expect(markdown).not.toContain("interpretation not recorded");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:test");
  } finally {
    vi.useRealTimers();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    clickSpy.mockRestore();
  }
});
