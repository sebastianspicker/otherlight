/**
 * Connects the didactics controller to its UI.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { interpretDidacticComparison } from "../../domain/education";
import { compareScenarioConfigsAtTime, nearestPrimaryTransitCentreSec } from "../../domain/education/compare";
import {
  isHypothesisLocked,
  revealSky,
  setHypothesis,
  type BinaryLabState,
} from "../../domain/education/binaryLab";
import type { UiRefs } from "../shell/refs";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveOverlaySeries,
} from "../render/lightCurve/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sky/sceneTypes";
import { cloneParams } from "../../domain/model/clone";
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
  updateDidacticHypothesis,
  updateDidacticResponse,
  type DidacticsRuntimeState,
} from "./didactics";
import { PRESETS, getPresetById } from "../../application/catalog/presets";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../application/catalog/binaryLab";
import { toEducationScenarioV4 } from "../../application/browserScenarioAdapter";
import { currentDidacticSignals } from "../../application/runtime/didacticSignals";
import { runWithErrorHandling } from "../shell/runWithErrorHandling";
import { isBinaryHypothesis } from "../scenario/scenarioFlow";
import type { AppSimulationRuntime } from "../../application/runtime/v4Runtime";

type DidacticsUiState = {
  params: BrowserScenarioDraft;
  didacticsRuntime: DidacticsRuntimeState;
  binaryLabState: BinaryLabState;
  t: number;
  comparisonCurveSeries?: LightCurveOverlaySeries[];
  comparisonInset?: LightCurveComparisonInset;
  comparisonGhosts?: SceneGhostGeometry[];
  comparisonBadges?: LightCurveBadge[];
};

export type WireDidacticsUiDeps = {
  invalidate?: () => void;
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
  select.value = PRESETS[0]?.id ?? "";
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
      renderAfterLessonMove(context);
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

function currentHintLevel(params: BrowserScenarioDraft): HintLevel {
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

/**
 * Rebuilds lesson signals for the current phase at the current time. The frame loop only
 * resamples while time advances, so paused navigation must refresh signals itself.
 */
function refreshLessonSignals(context: DidacticsWireContext): void {
  const { state, getSimulation } = context;
  // Grade against the live lesson/step in app state; the runtime's didactics
  // config is a build-time clone that lesson navigation does not update.
  const frame = getSimulation().step(state.t);
  state.didacticsRuntime = onDidacticSignals(
    state.params,
    state.didacticsRuntime,
    currentDidacticSignals(state.params, frame),
    frame.timing,
    state.t,
  );
}

function renderAfterLessonMove(context: DidacticsWireContext): void {
  runWithErrorHandling(() => refreshLessonSignals(context), { statusEl: context.warnEl });
  renderDidacticSignals(context.refs, context.state.didacticsRuntime);
}

function wireCheckButton(context: DidacticsWireContext): void {
  const { refs, state, warnEl, getSuccessMessage, listenerOptions } = context;
  refs.didCheckBtn?.addEventListener(
    "click",
    () => {
      runWithErrorHandling(
        () => {
          refreshLessonSignals(context);
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
      renderAfterLessonMove(context);
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
      renderAfterLessonMove(context);
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
        statusEl: document.getElementById("didExportStatus") ?? warnEl,
        getSuccessMessage: () =>
          "Report download started. Check your browser downloads. Save the workspace separately.",
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
          context.invalidate?.();
        },
        { statusEl: refs.didCompareOut, errorPrefix: "Compare failed: " },
      );
    },
    listenerOptions,
  );
}

type DidacticComparisonResult = ReturnType<typeof compareScenarioConfigsAtTime>;

// A blank time field means "the primary transit or eclipse of scenario A".
function comparisonTimeSec(
  refs: UiRefs,
  configA: ReturnType<AppSimulationRuntime["getConfig"]>,
  tNowSec: number,
): number {
  const raw = refs.didCompareTime?.value.trim() ?? "";
  const typed = raw === "" ? Number.NaN : Number(raw);
  if (Number.isFinite(typed)) return typed;
  const centreSec = nearestPrimaryTransitCentreSec(configA, tNowSec);
  if (refs.didCompareTime) refs.didCompareTime.value = centreSec.toFixed(0);
  return centreSec;
}

function runDidacticComparison(context: DidacticsWireContext): {
  comparison: DidacticComparisonResult;
  text: string;
} {
  const { refs, state, getSimulation, currentLessonSimMode } = context;
  const presetB = getPresetById(refs.didComparePreset?.value ?? "default");
  // Scenario A is the live runtime's config; B goes through the same adapter path (incl. binary).
  const configA = getSimulation().getConfig();
  const configB = toEducationScenarioV4({
    system: cloneParams(presetB.params),
    binaryMode: currentLessonSimMode() === "binary-lab",
    runtimeMode: configA.runtime?.mode ?? "realtime",
    binaryLabDefaults: DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
  });
  const comparison = compareScenarioConfigsAtTime(
    configA,
    configB,
    comparisonTimeSec(refs, configA, state.t),
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
  result: { comparison: DidacticComparisonResult; text: string },
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
      const select = refs.didHypothesisSelect!;
      if (isHypothesisLocked(state.binaryLabState)) {
        // The pre-reveal claim is frozen once the sky is visible.
        select.value = state.binaryLabState.hypothesis ?? "";
        syncHypothesisLock(refs, state.binaryLabState);
        return;
      }
      const selected = select.value;
      const hypothesis = isBinaryHypothesis(selected) ? selected : undefined;
      state.binaryLabState = hypothesis
        ? setHypothesis(state.binaryLabState, hypothesis)
        : { ...state.binaryLabState, hypothesis: undefined };
      state.didacticsRuntime = updateDidacticHypothesis(state.didacticsRuntime, hypothesis ?? "", state.t);
      if (hypothesis && warnEl) warnEl.textContent = "";
      syncBinaryUi();
    },
    listenerOptions,
  );
  refs.didRevealSkyBtn?.addEventListener(
    "click",
    () => {
      state.binaryLabState = revealSky(state.binaryLabState);
      syncBinaryUi();
      syncHypothesisLock(refs, state.binaryLabState);
      announceDidacticResult("Sky geometry revealed. Compare it with your hypothesis and the light curve.");
    },
    listenerOptions,
  );
}

function syncHypothesisLock(refs: UiRefs, binaryLabState: BinaryLabState): void {
  if (refs.didHypothesisSelect && isHypothesisLocked(binaryLabState))
    refs.didHypothesisSelect.disabled = true;
}
