import type { SystemParams } from "../core/types";
import { compareScenariosAtTime, interpretDidacticComparison } from "../didactics";
import { revealSky, setHypothesis, type BinaryLabState } from "../didactics/binaryLab";
import type { UiRefs } from "../ui/refs";
import type { LightCurveBadge, LightCurveComparisonInset, LightCurveOverlaySeries } from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";
import { cloneParams } from "./scenario";
import {
  advanceLessonFlow,
  ensureDidacticsConfig,
  exportDidacticReport,
  initDidacticsRuntime,
  nextHintLevel,
  onDidacticSignals,
  populateDidacticsControls,
  previousHintLevel,
  renderDidacticComparison,
  renderDidacticSignals,
  resolveSelectedDidacticEventTime,
  retreatLessonFlow,
  syncDidacticsControlsFromParams,
  updateDidacticComparison,
  updateDidacticResponse,
  type DidacticsRuntimeState,
} from "./didactics";
import { PRESETS, getPresetById } from "./presets";
import { runWithErrorHandling } from "./runWithErrorHandling";
import { isBinaryHypothesis } from "./scenarioFlow";
import type { AppSimulationRuntime } from "./v4Runtime";

type DidacticsUiState = {
  params: SystemParams;
  didacticsRuntime: DidacticsRuntimeState;
  binaryLabState: BinaryLabState;
  t: number;
  comparisonCurveSeries?: LightCurveOverlaySeries[];
  comparisonInset?: LightCurveComparisonInset;
  comparisonGhosts?: SceneGhostGeometry[];
  comparisonBadges?: LightCurveBadge[];
};

export type WireDidacticsUiDeps = {
  refs: UiRefs;
  state: DidacticsUiState;
  getSimulation: () => AppSimulationRuntime;
  currentLessonSimMode: () => "preset-lab" | "binary-lab";
  seekToTime: (targetSec: number, opts?: { resetNoise?: boolean }) => void;
  syncBinaryUi: () => void;
  warnEl: HTMLElement | null;
  getSuccessMessage: () => string;
};

export function wireDidacticsUi(deps: WireDidacticsUiDeps): void {
  const {
    refs,
    state,
    getSimulation,
    currentLessonSimMode,
    seekToTime,
    syncBinaryUi,
    warnEl,
    getSuccessMessage,
  } = deps;

  populateDidacticsControls(refs, currentLessonSimMode());
  syncDidacticsControlsFromParams(state.params, refs, currentLessonSimMode());

  if (refs.didComparePreset) {
    refs.didComparePreset.replaceChildren();
    for (const preset of PRESETS) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.label;
      refs.didComparePreset.appendChild(opt);
    }
    refs.didComparePreset.value = "nbody-with-perturber";
  }

  refs.didLessonSelect?.addEventListener("change", () => {
    state.params = ensureDidacticsConfig(state.params);
    state.params = {
      ...state.params,
      didactics: { ...state.params.didactics!, activeLessonId: refs.didLessonSelect!.value },
    };
    state.didacticsRuntime = initDidacticsRuntime(state.params, state.t);
    renderDidacticSignals(refs, state.didacticsRuntime);
  });

  refs.didPrimaryResponseInput?.addEventListener("input", () => {
    state.didacticsRuntime = updateDidacticResponse(
      state.didacticsRuntime,
      { primary: refs.didPrimaryResponseInput!.value },
      state.t,
    );
  });

  refs.didSecondaryResponseInput?.addEventListener("input", () => {
    state.didacticsRuntime = updateDidacticResponse(
      state.didacticsRuntime,
      { secondary: refs.didSecondaryResponseInput!.value },
      state.t,
    );
  });

  refs.didHintLevelSelect?.addEventListener("change", () => {
    const nextLevel =
      refs.didHintLevelSelect!.value === "L3" ? "L3" : refs.didHintLevelSelect!.value === "L2" ? "L2" : "L1";
    state.params = ensureDidacticsConfig(state.params);
    state.params = {
      ...state.params,
      didactics: { ...state.params.didactics!, hintLevel: nextLevel },
    };
    renderDidacticSignals(refs, state.didacticsRuntime);
  });

  refs.didHintLessBtn?.addEventListener("click", () => {
    const currentLevel =
      state.params.didactics?.hintLevel === "L3"
        ? "L3"
        : state.params.didactics?.hintLevel === "L2"
          ? "L2"
          : "L1";
    const nextLevel = previousHintLevel(currentLevel);
    state.params = ensureDidacticsConfig(state.params);
    state.params = {
      ...state.params,
      didactics: { ...state.params.didactics!, hintLevel: nextLevel },
    };
    if (refs.didHintLevelSelect) refs.didHintLevelSelect.value = nextLevel;
    renderDidacticSignals(refs, state.didacticsRuntime);
  });

  refs.didHintMoreBtn?.addEventListener("click", () => {
    const currentLevel =
      state.params.didactics?.hintLevel === "L3"
        ? "L3"
        : state.params.didactics?.hintLevel === "L2"
          ? "L2"
          : "L1";
    const nextLevel = nextHintLevel(currentLevel);
    state.params = ensureDidacticsConfig(state.params);
    state.params = {
      ...state.params,
      didactics: { ...state.params.didactics!, hintLevel: nextLevel },
    };
    if (refs.didHintLevelSelect) refs.didHintLevelSelect.value = nextLevel;
    renderDidacticSignals(refs, state.didacticsRuntime);
  });

  refs.didAutoAssess?.addEventListener("input", () => {
    state.params = ensureDidacticsConfig(state.params);
    state.params = {
      ...state.params,
      didactics: { ...state.params.didactics!, autoAssess: refs.didAutoAssess!.checked },
    };
  });

  refs.didCheckBtn?.addEventListener("click", () => {
    runWithErrorHandling(
      () => {
        const step = getSimulation().step(state.t);
        state.didacticsRuntime = onDidacticSignals(
          state.params,
          state.didacticsRuntime,
          step.didactics?.signals,
          step.timing,
          state.t,
        );
        renderDidacticSignals(refs, state.didacticsRuntime);
      },
      { statusEl: warnEl, getSuccessMessage },
    );
  });

  refs.didPrevBtn?.addEventListener("click", () => {
    state.didacticsRuntime = retreatLessonFlow(state.params, state.didacticsRuntime, state.t);
    renderDidacticSignals(refs, state.didacticsRuntime);
  });

  refs.didNextBtn?.addEventListener("click", () => {
    state.didacticsRuntime = advanceLessonFlow(state.params, state.didacticsRuntime, state.t);
    renderDidacticSignals(refs, state.didacticsRuntime);
  });

  refs.didExportBtn?.addEventListener("click", () => {
    runWithErrorHandling(() => exportDidacticReport(state.params, state.didacticsRuntime), {
      statusEl: warnEl,
      getSuccessMessage,
      errorPrefix: "Export failed: ",
    });
  });

  refs.didJumpEventBtn?.addEventListener("click", () => {
    runWithErrorHandling(
      () => {
        const targetTime = resolveSelectedDidacticEventTime(state.didacticsRuntime, refs);
        if (!Number.isFinite(targetTime)) throw new Error("No timed lesson event is available yet.");
        seekToTime(Number(targetTime), { resetNoise: false });
      },
      { statusEl: warnEl, getSuccessMessage },
    );
  });

  refs.didCompareBtn?.addEventListener("click", () => {
    runWithErrorHandling(
      () => {
        const presetB = getPresetById(refs.didComparePreset?.value ?? "default");
        const tCmp = Number(refs.didCompareTime?.value ?? "0");
        const cmp = compareScenariosAtTime(
          state.params,
          cloneParams(presetB.params),
          Number.isFinite(tCmp) ? tCmp : 0,
        );
        const comparisonText = interpretDidacticComparison(cmp, {
          lessonId: state.didacticsRuntime.learning.lessonId,
          comparisonPrompt: state.didacticsRuntime.latestSignals?.comparisonPrompt,
        });
        renderDidacticComparison(refs, comparisonText);
        state.didacticsRuntime = updateDidacticComparison(state.didacticsRuntime, cmp, comparisonText);
        state.comparisonCurveSeries = cmp.visual?.curveSeries;
        state.comparisonInset = cmp.visual?.comparisonInset;
        state.comparisonGhosts = cmp.visual?.sceneGhosts;
        state.comparisonBadges = cmp.visual?.badges;
      },
      { statusEl: refs.didCompareOut, errorPrefix: "Compare failed: " },
    );
  });

  refs.didHypothesisSelect?.addEventListener("change", () => {
    const selected = refs.didHypothesisSelect!.value;
    if (isBinaryHypothesis(selected)) {
      state.binaryLabState = setHypothesis(state.binaryLabState, selected);
      state.didacticsRuntime = updateDidacticResponse(state.didacticsRuntime, { primary: selected }, state.t);
      if (warnEl) warnEl.textContent = "";
    } else {
      state.binaryLabState = { ...state.binaryLabState, hypothesis: undefined };
      state.didacticsRuntime = updateDidacticResponse(state.didacticsRuntime, { primary: "" }, state.t);
    }
    syncBinaryUi();
  });

  refs.didRevealSkyBtn?.addEventListener("click", () => {
    state.binaryLabState = revealSky(state.binaryLabState);
    syncBinaryUi();
  });
}
