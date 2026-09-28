/** Verifies compact observatory navigation against live lesson phases and frame signals. */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cloneParams } from "../../src/domain/model/clone";
import { SCENARIO_DEFAULTS } from "../../src/application/catalog/defaults";
import { createSimulationRuntimeV4FromParams } from "../../src/application/runtime/v4Runtime";
import { currentDidacticSignals } from "../../src/application/runtime/didacticSignals";
import type { UiRefs } from "../../src/presentation/shell/refs";
import type { BootstrapAppState } from "../../src/composition/appState";
import {
  advanceLessonFlow,
  ensureDidacticsConfig,
  initDidacticsRuntime,
  onDidacticSignals,
} from "../../src/presentation/labs/didactics";
import { wireObservatoryNavigation } from "../../src/presentation/observatory/observatoryNavigation";

let dom: JSDOM;
let previousDocument: typeof document;

beforeEach(() => {
  dom = new JSDOM(`<!doctype html><body>
    <select id="productMode">
      <option value="simulation" selected>Simulation</option>
      <option value="lab">Guided Labs</option>
    </select>
    <nav class="lab-rail">
      <button data-observatory-phase="predict">Hypothesis</button>
      <button data-observatory-phase="observe">Experiment</button>
      <button data-observatory-phase="explain">Interpretation</button>
    </nav>
    <h2 id="didPhaseTitle" tabindex="-1"></h2>
    <p id="didPhasePrompt"></p>
    <button id="observatoryInterpretBtn">Record interpretation</button>
  </body>`);
  previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  dom.window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  globalThis.document = previousDocument;
  dom.window.close();
});

describe("observatory lesson navigation", () => {
  it("recomputes a real selected phase when runtime didactics are absent", () => {
    const params = ensureDidacticsConfig(cloneParams(SCENARIO_DEFAULTS));
    const runtimeParams = cloneParams(params);
    runtimeParams.didactics = { ...runtimeParams.didactics, enabled: false };
    const simulation = createSimulationRuntimeV4FromParams({
      system: runtimeParams,
      binaryMode: false,
      runtimeMode: "realtime",
    });
    const liveFrame = simulation.step(0);
    expect(liveFrame.didactics).toBeUndefined();

    const state = {
      params,
      t: 0,
      didacticsRuntime: {
        ...initDidacticsRuntime(params, 0),
        learning: {
          ...initDidacticsRuntime(params, 0).learning,
          passedStepIds: ["kepler-step-1"],
        },
        responses: { saved: { primary: "keep this response" } },
      },
    } as unknown as BootstrapAppState;
    const refs = {
      productModeSelect: document.getElementById("productMode"),
      didPhaseTitle: document.getElementById("didPhaseTitle"),
      didPhasePrompt: document.getElementById("didPhasePrompt"),
    } as unknown as UiRefs;
    const refreshDidacticSignals = vi.fn(() => {
      state.didacticsRuntime = onDidacticSignals(
        state.params,
        state.didacticsRuntime,
        currentDidacticSignals(state.params, liveFrame),
        liveFrame.timing,
        liveFrame.tObsSec,
      );
    });
    const navigation = wireObservatoryNavigation({
      refs,
      state,
      signal: new dom.window.AbortController().signal as AbortSignal,
      invalidate: vi.fn(),
      refreshDidacticSignals,
    });

    const hypothesis = document.querySelector<HTMLButtonElement>('[data-observatory-phase="predict"]')!;
    const experiment = document.querySelector<HTMLButtonElement>('button[data-observatory-phase="observe"]')!;
    expect(document.body.dataset.observatoryPhase).toBe("observe");
    expect(state.didacticsRuntime.learning.stepIndex).toBe(0);
    hypothesis.click();

    expect(refreshDidacticSignals).toHaveBeenCalledOnce();
    expect(state.didacticsRuntime.learning.stepIndex).toBe(1);
    expect(state.didacticsRuntime.learning.phaseIndex).toBe(0);
    expect(state.didacticsRuntime.latestSignals?.phaseType).toBe("predict");
    expect(state.didacticsRuntime.latestSignals?.phaseTitle).toBe("Predict the depth match");
    expect(state.didacticsRuntime.latestSignals?.phasePrompt).toBe(
      "Predict whether the physical transit depth should match the simple radius-ratio estimate in this geometry.",
    );
    expect(document.getElementById("didPhaseTitle")?.textContent).toBe("Predict the depth match");
    expect(state.didacticsRuntime.responses.saved?.primary).toBe("keep this response");
    expect(state.didacticsRuntime.learning.passedStepIds).toContain("kepler-step-1");

    state.didacticsRuntime = advanceLessonFlow(state.params, state.didacticsRuntime, state.t);
    refreshDidacticSignals();
    navigation.sync();
    expect(state.didacticsRuntime.latestSignals?.phaseType).toBe("observe");
    expect(document.body.dataset.observatoryPhase).toBe("observe");
    expect(experiment.getAttribute("aria-current")).toBe("step");

    state.didacticsRuntime.learning = {
      lessonId: "missing-lesson",
      stepIndex: 0,
      phaseIndex: 0,
      passedStepIds: [],
    };
    navigation.sync();
    expect(hypothesis.disabled).toBe(true);
    expect((document.getElementById("observatoryInterpretBtn") as HTMLButtonElement).disabled).toBe(true);
    hypothesis.click();
    expect(refreshDidacticSignals).toHaveBeenCalledTimes(2);
  });

  it("keeps the current lesson step when Guided Labs selects an observatory phase", () => {
    const productModeSelect = document.getElementById("productMode") as HTMLSelectElement;
    productModeSelect.value = "lab";
    const params = ensureDidacticsConfig(cloneParams(SCENARIO_DEFAULTS));
    const simulation = createSimulationRuntimeV4FromParams({
      system: params,
      binaryMode: false,
      runtimeMode: "realtime",
    });
    const liveFrame = simulation.step(0);
    const state = {
      params,
      t: 0,
      didacticsRuntime: initDidacticsRuntime(params, 0),
    } as unknown as BootstrapAppState;
    const refs = {
      productModeSelect,
      didPhaseTitle: document.getElementById("didPhaseTitle"),
      didPhasePrompt: document.getElementById("didPhasePrompt"),
    } as unknown as UiRefs;
    const refreshDidacticSignals = () => {
      state.didacticsRuntime = onDidacticSignals(
        state.params,
        state.didacticsRuntime,
        currentDidacticSignals(state.params, liveFrame),
        liveFrame.timing,
        liveFrame.tObsSec,
      );
    };
    wireObservatoryNavigation({
      refs,
      state,
      signal: new dom.window.AbortController().signal as AbortSignal,
      invalidate: vi.fn(),
      refreshDidacticSignals,
    });

    document.querySelector<HTMLButtonElement>('button[data-observatory-phase="explain"]')!.click();

    expect(state.didacticsRuntime.learning.stepIndex).toBe(0);
    expect(state.didacticsRuntime.latestSignals?.phaseTitle).toBe("Explain the geometry");
  });
});
