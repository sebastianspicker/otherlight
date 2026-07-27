/**
 * Owns didactics Wiring support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemParams } from "../core/types";
import { compareScenariosAtTime, interpretDidacticComparison } from "../didactics";
import { revealSky, setHypothesis, type BinaryLabState } from "../didactics/binaryLab";
import type { UiRefs } from "../ui/refs";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveOverlaySeries,
} from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";
import { cloneParams } from "./scenario";
import {
  advanceLessonFlow,
  ensureDidacticsConfig,
  exportDidacticReport,
  nextHintLevel,
  onDidacticSignals,
  populateDidacticsControls,
  previousHintLevel,
  renderDidacticComparison,
  renderDidacticSignals,
  resolveSelectedDidacticEventTime,
  retreatLessonFlow,
  switchDidacticsLesson,
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
  signal?: AbortSignal;
};

type ListenerOptions = AddEventListenerOptions | undefined;
type DidacticsWireContext = WireDidacticsUiDeps & {
  listenerOptions: ListenerOptions;
};
type HintLevel = "L1" | "L2" | "L3";

function announceDidacticResult(message: string): void {
  const region = typeof document === "undefined" ? null : document.getElementById("didAnnouncement");
  if (region) region.textContent = message;
}

function focusPhaseHeading(): void {
  const heading = typeof document === "undefined" ? null : document.getElementById("didPhaseTitle");
  heading?.focus();
}

export function wireDidacticsUi(deps: WireDidacticsUiDeps): void {
  const context: DidacticsWireContext = {
    ...deps,
    listenerOptions: deps.signal ? { signal: deps.signal } : undefined,
  };

  initializeDidacticsUi(context);
  wireLessonSelection(context);
  wireResponseInputs(context);
  wireHintControls(context);
  wireAssessmentControls(context);
  wireLessonNavigation(context);
  wireReportAndJumpControls(context);
  wireComparisonControl(context);
  wireBinaryLabControls(context);
}

function initializeDidacticsUi(context: DidacticsWireContext): void {
  const { refs, state, currentLessonSimMode } = context;
  populateDidacticsControls(refs, currentLessonSimMode());
  syncDidacticsControlsFromParams(state.params, refs, currentLessonSimMode());
  populateComparePresetOptions(refs);
}

function populateComparePresetOptions(refs: UiRefs): void {
  const select = refs.didComparePreset;
  if (!select) return;
  select.replaceChildren();
  for (const preset of PRESETS) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    select.appendChild(opt);
  }
  select.value = "nbody-with-perturber";
}

function wireLessonSelection(context: DidacticsWireContext): void {
  const { refs, state, currentLessonSimMode, listenerOptions } = context;
  const select = refs.didLessonSelect;
  select?.addEventListener(
    "change",
    () => {
      state.params = ensureDidacticsConfig(state.params);
      state.didacticsRuntime = switchDidacticsLesson(
        state.params,
        state.didacticsRuntime,
        select.value,
        state.t,
        currentLessonSimMode(),
      );
      renderDidacticSignals(refs, state.didacticsRuntime);
      announceDidacticResult(
        `Lesson changed. ${state.didacticsRuntime.latestSignals?.phaseTitle ?? "First phase"}.`,
      );
      focusPhaseHeading();
    },
    listenerOptions,
  );
}

function wireResponseInputs(context: DidacticsWireContext): void {
  const { refs, state, listenerOptions } = context;
  const primary = refs.didPrimaryResponseInput;
  const secondary = refs.didSecondaryResponseInput;

  primary?.addEventListener(
    "input",
    () => {
      state.didacticsRuntime = updateDidacticResponse(
        state.didacticsRuntime,
        { primary: primary.value },
        state.t,
      );
    },
    listenerOptions,
  );

  secondary?.addEventListener(
    "input",
    () => {
      state.didacticsRuntime = updateDidacticResponse(
        state.didacticsRuntime,
        { secondary: secondary.value },
        state.t,
      );
    },
    listenerOptions,
  );
}

function wireHintControls(context: DidacticsWireContext): void {
  const { refs, listenerOptions } = context;
  refs.didHintLevelSelect?.addEventListener(
    "change",
    () => setHintLevel(context, normalizedHintLevel(refs.didHintLevelSelect?.value)),
    listenerOptions,
  );
  refs.didHintLessBtn?.addEventListener(
    "click",
    () => setHintLevel(context, previousHintLevel(currentHintLevel(context.state.params))),
    listenerOptions,
  );
  refs.didHintMoreBtn?.addEventListener(
    "click",
    () => setHintLevel(context, nextHintLevel(currentHintLevel(context.state.params))),
    listenerOptions,
  );
}

function normalizedHintLevel(value: string | undefined): HintLevel {
  if (value === "L3") return "L3";
  if (value === "L2") return "L2";
  return "L1";
}

function currentHintLevel(params: SystemParams): HintLevel {
  return normalizedHintLevel(params.didactics?.hintLevel);
}

function setHintLevel(context: DidacticsWireContext, nextLevel: HintLevel): void {
  const { refs, state } = context;
  state.params = ensureDidacticsConfig(state.params);
  state.params = {
    ...state.params,
    didactics: { ...state.params.didactics!, hintLevel: nextLevel },
  };
  if (refs.didHintLevelSelect) refs.didHintLevelSelect.value = nextLevel;
  renderDidacticSignals(refs, state.didacticsRuntime);
}

function wireAssessmentControls(context: DidacticsWireContext): void {
  const { refs, state, listenerOptions } = context;
  refs.didAutoAssess?.addEventListener(
    "input",
    () => {
      state.params = ensureDidacticsConfig(state.params);
      state.params = {
        ...state.params,
        didactics: { ...state.params.didactics!, autoAssess: refs.didAutoAssess!.checked },
      };
    },
    listenerOptions,
  );
  wireCheckButton(context);
}

function wireCheckButton(context: DidacticsWireContext): void {
  const { refs, state, getSimulation, warnEl, getSuccessMessage, listenerOptions } = context;
  refs.didCheckBtn?.addEventListener(
    "click",
    () => {
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
          const checks = state.didacticsRuntime.latestSignals?.checks ?? [];
          const passed = checks.filter((check) => check.passed).length;
          announceDidacticResult(`Check complete. ${passed} of ${checks.length} criteria are on target.`);
        },
        { statusEl: warnEl, getSuccessMessage },
      );
    },
    listenerOptions,
  );
}

function wireLessonNavigation(context: DidacticsWireContext): void {
  const { refs, state, listenerOptions } = context;
  refs.didPrevBtn?.addEventListener(
    "click",
    () => {
      state.didacticsRuntime = retreatLessonFlow(state.params, state.didacticsRuntime, state.t);
      renderDidacticSignals(refs, state.didacticsRuntime);
      announceDidacticResult(
        `Moved to ${state.didacticsRuntime.latestSignals?.phaseTitle ?? "the previous phase"}.`,
      );
      focusPhaseHeading();
    },
    listenerOptions,
  );
  refs.didNextBtn?.addEventListener(
    "click",
    () => {
      state.didacticsRuntime = advanceLessonFlow(state.params, state.didacticsRuntime, state.t);
      renderDidacticSignals(refs, state.didacticsRuntime);
      announceDidacticResult(
        `Moved to ${state.didacticsRuntime.latestSignals?.phaseTitle ?? "the next phase"}.`,
      );
      focusPhaseHeading();
    },
    listenerOptions,
  );
}

function wireReportAndJumpControls(context: DidacticsWireContext): void {
  const { refs, state, warnEl, getSuccessMessage, seekToTime, listenerOptions } = context;
  refs.didExportBtn?.addEventListener(
    "click",
    () => {
      runWithErrorHandling(() => exportDidacticReport(state.params, state.didacticsRuntime), {
        statusEl: warnEl,
        getSuccessMessage,
        errorPrefix: "Export failed: ",
      });
    },
    listenerOptions,
  );
  refs.didJumpEventBtn?.addEventListener(
    "click",
    () => {
      runWithErrorHandling(
        () => {
          const targetTime = resolveSelectedDidacticEventTime(state.didacticsRuntime, refs);
          if (!Number.isFinite(targetTime)) throw new Error("No timed lesson event is available yet.");
          seekToTime(Number(targetTime), { resetNoise: false });
        },
        { statusEl: warnEl, getSuccessMessage },
      );
    },
    listenerOptions,
  );
}

function wireComparisonControl(context: DidacticsWireContext): void {
  const { refs, state, listenerOptions } = context;
  refs.didCompareBtn?.addEventListener(
    "click",
    () => {
      runWithErrorHandling(
        () => {
          const comparison = runDidacticComparison(context);
          renderDidacticComparison(refs, comparison.text);
          applyDidacticComparisonState(state, comparison);
        },
        { statusEl: refs.didCompareOut, errorPrefix: "Compare failed: " },
      );
    },
    listenerOptions,
  );
}

function runDidacticComparison(context: DidacticsWireContext): {
  comparison: ReturnType<typeof compareScenariosAtTime>;
  text: string;
} {
  const { refs, state } = context;
  const presetB = getPresetById(refs.didComparePreset?.value ?? "default");
  const tCmp = Number(refs.didCompareTime?.value ?? "0");
  const comparison = compareScenariosAtTime(
    state.params,
    cloneParams(presetB.params),
    Number.isFinite(tCmp) ? tCmp : 0,
  );
  return {
    comparison,
    text: interpretDidacticComparison(comparison, {
      lessonId: state.didacticsRuntime.learning.lessonId,
      comparisonPrompt: state.didacticsRuntime.latestSignals?.comparisonPrompt,
    }),
  };
}

function applyDidacticComparisonState(
  state: DidacticsUiState,
  result: { comparison: ReturnType<typeof compareScenariosAtTime>; text: string },
): void {
  state.didacticsRuntime = updateDidacticComparison(state.didacticsRuntime, result.comparison, result.text);
  state.comparisonCurveSeries = result.comparison.visual?.curveSeries;
  state.comparisonInset = result.comparison.visual?.comparisonInset;
  state.comparisonGhosts = result.comparison.visual?.sceneGhosts;
  state.comparisonBadges = result.comparison.visual?.badges;
}

function wireBinaryLabControls(context: DidacticsWireContext): void {
  const { refs, state, syncBinaryUi, warnEl, listenerOptions } = context;
  refs.didHypothesisSelect?.addEventListener(
    "change",
    () => {
      const selected = refs.didHypothesisSelect!.value;
      if (isBinaryHypothesis(selected)) {
        state.binaryLabState = setHypothesis(state.binaryLabState, selected);
        state.didacticsRuntime = updateDidacticResponse(
          state.didacticsRuntime,
          { primary: selected },
          state.t,
        );
        if (warnEl) warnEl.textContent = "";
      } else {
        state.binaryLabState = { ...state.binaryLabState, hypothesis: undefined };
        state.didacticsRuntime = updateDidacticResponse(state.didacticsRuntime, { primary: "" }, state.t);
      }
      syncBinaryUi();
    },
    listenerOptions,
  );
  refs.didRevealSkyBtn?.addEventListener(
    "click",
    () => {
      state.binaryLabState = revealSky(state.binaryLabState);
      syncBinaryUi();
      announceDidacticResult("Sky geometry revealed. Compare it with your hypothesis and the light curve.");
    },
    listenerOptions,
  );
}
