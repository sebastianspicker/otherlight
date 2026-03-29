import type { RuntimeModeV4 } from "../sim/v4";
import { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import { cloneParams } from "./scenario";
import { buildBinaryLabParams, DEFAULT_BINARY_LAB_CONFIG_V4 } from "./binaryLab";
import { PRESETS, getPresetById } from "./presets";
import { REAL_SYSTEMS_OPTIONS } from "./realSystems";
import { wireDebugDOM } from "./debug";
import { runWithErrorHandling } from "./runWithErrorHandling";
import { readTimeSpeed, syncSliderMirrorsFromInputs } from "./actions";
import { createSimulationRuntimeV4FromParams, type AppSimulationRuntime } from "./v4Runtime";
import { uiWarningText } from "./warnings";
import { initNoiseState } from "./noise";
import {
  formatOcFitSummary,
  formatOcPanelStats,
  renderOcHistoryCanvas,
  type OcBody,
  type OcTrendMode,
  type OcUnit,
  exportOcCsv,
} from "./ocPlot";
import {
  createTransitHistoryState,
  formatTransitHistorySummary,
  resetTransitHistoryState,
  updateTransitHistoryFromStep,
} from "./transitHistory";
import {
  ensureDidacticsConfig,
  exportDidacticReport,
  forceNextLessonStep,
  initDidacticsRuntime,
  onDidacticSignals,
  populateDidacticsControls,
  renderDidacticComparison,
  renderDidacticSignals,
  syncDidacticsControlsFromParams,
} from "./didactics";
import {
  compareScenariosAtTime,
  computeDidacticSignals,
  evaluateDidacticsV3,
  interpretDidacticComparison,
} from "../didactics";
import { createBinaryLabState, revealSky, setHypothesis } from "../didactics/binaryLab";
import { setDidacticsHook, setDidacticsV3Hook } from "../sim/didacticsHook";
import { uiRefs } from "../ui/refs";
import { readUIIntoParams } from "../ui/params";
import { syncAllEnableStates, wireEnableHandlers } from "../ui/enable";
import { wireParamSliders } from "../ui/sliders";
import {
  applyActiveScenarioForMode,
  BINARY_MODE_VALUE,
  isBinaryHypothesis,
  isBinaryModeActive,
  PRESET_MODE_VALUE,
  syncBinaryLabUiState,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";
import { createFrameLoopController, type FrameLoopState } from "./frameLoop";
import { replaceRuntime, takeRuntimeStatus } from "./runtimeLifecycle";

// TODO: AppState merges all state into a single intersection type (god object).
// Consider separating concerns: simulation state, UI state, and scenario flow state
// could each be managed independently with explicit coordination points.
type AppState = ScenarioFlowState & FrameLoopState;

export async function initApp(): Promise<void> {
  // Wire didactics hooks so sim/ can call them without importing didactics/ directly.
  setDidacticsHook(computeDidacticSignals);
  setDidacticsV3Hook(evaluateDidacticsV3);

  const {
    skyCanvas,
    lcCanvas,
    btnStart,
    btnReset,
    btnClearLC,
    timeSpeed,
    timeSpeedVal,
    simModeSelect,
    runtimeModeSelect,
    presetSelect,
    presetDesc,
    realSystemSelect,
    realSystemMeta,
    warnVal,
    timingHistoryVal,
    didLessonSelect,
    didAutoAssess,
    didCheckBtn,
    didNextBtn,
    didExportBtn,
    didComparePreset,
    didCompareTime,
    didCompareBtn,
    didHypothesisSelect,
    didRevealSkyBtn,
    ocCanvas,
    ocBodySelect,
    ocUnitSelect,
    ocTrendModeSelect,
    ocExportBtn,
    ocClearBtn,
    ocStatsVal,
    ocFitVal,
    btnApplyParams,
    btnResetParams,
  } = uiRefs;

  const renderer = new Canvas2DRenderer(skyCanvas);
  const plot = new LightCurvePlot(lcCanvas, 900);
  let ocBody: OcBody = "planet";
  let ocUnit: OcUnit = "s";
  let ocTrendMode: OcTrendMode = "raw";

  const appState: AppState = {
    scenarioDefaults: buildBinaryLabParams(),
    params: buildBinaryLabParams(),
    didacticsRuntime: initDidacticsRuntime(buildBinaryLabParams(), 0),
    noise: initNoiseState(buildBinaryLabParams()),
    binaryLabState: createBinaryLabState(DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab),
    running: false,
    t: 0,
    last: performance.now(),
    lastPlottedT: Number.NaN,
    lastPlotMode: null,
    lastFluxForPlot: 1,
    lastStepV3: null,
    transitHistory: createTransitHistoryState(),
  };
  appState.params = ensureDidacticsConfig(cloneParams(appState.scenarioDefaults));
  appState.didacticsRuntime = initDidacticsRuntime(appState.params, 0);
  appState.noise = initNoiseState(appState.params);

  function readRuntimeModeFromUi(): RuntimeModeV4 {
    return runtimeModeSelect?.value === "reference" ? "reference" : "realtime";
  }

  function runtimeArgsFromCurrentParams() {
    return {
      system: appState.params,
      binaryMode: isBinaryModeActive(uiRefs),
      runtimeMode: readRuntimeModeFromUi(),
      binaryLabDefaults: DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
    };
  }

  let simulation: AppSimulationRuntime = createSimulationRuntimeV4FromParams(runtimeArgsFromCurrentParams());

  function renderOcPanel(): void {
    renderOcHistoryCanvas(ocCanvas, appState.transitHistory, ocBody, {
      unit: ocUnit,
      trendMode: ocTrendMode,
    });
    if (ocStatsVal) {
      ocStatsVal.textContent = formatOcPanelStats(appState.transitHistory, ocBody, {
        unit: ocUnit,
        trendMode: ocTrendMode,
      });
    }
    if (ocFitVal)
      ocFitVal.textContent = formatOcFitSummary(appState.transitHistory, ocBody, { unit: ocUnit });
  }

  async function rebuildSimulationFromParams(): Promise<void> {
    simulation = await replaceRuntime(simulation, runtimeArgsFromCurrentParams());
    const status = takeRuntimeStatus(simulation);
    if (status && warnVal) warnVal.textContent = status;
  }

  const frame = createFrameLoopController({
    refs: uiRefs,
    renderer,
    plot,
    state: appState,
    getSimulation: () => simulation,
    getParams: () => appState.params,
    getBinaryLabState: () => appState.binaryLabState,
    isBinaryModeActive: () => isBinaryModeActive(uiRefs),
    uiWarningText,
    onSampleStep: (step, tSec) => {
      appState.didacticsRuntime = onDidacticSignals(
        appState.params,
        appState.didacticsRuntime,
        step.didactics?.signals,
        tSec,
      );
      renderDidacticSignals(uiRefs, appState.didacticsRuntime);
      const changed = updateTransitHistoryFromStep({
        state: appState.transitHistory,
        step,
        system: appState.params,
        tNowSec: tSec,
      });
      if ((changed || !timingHistoryVal?.textContent) && timingHistoryVal) {
        timingHistoryVal.textContent = formatTransitHistorySummary(appState.transitHistory);
      }
      if (changed) renderOcPanel();
    },
    renderOcPanel,
  });

  const scenarioDeps: ScenarioFlowDeps = {
    refs: uiRefs,
    state: appState,
    getTimeSec: () => appState.t,
    rebuildSimulationFromParams,
    resetSimTimeAndLC: frame.resetSimTimeAndLC,
  };
  const applyGuard: ScenarioApplyGuard = { applying: false };

  function syncBinaryUi(): void {
    syncBinaryLabUiState(uiRefs, appState.binaryLabState);
  }

  async function applyActive(): Promise<void> {
    await withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
      await applyActiveScenarioForMode(scenarioDeps);
      syncBinaryUi();
    });
  }

  timeSpeed.addEventListener("input", () => void readTimeSpeed(timeSpeed, timeSpeedVal));
  readTimeSpeed(timeSpeed, timeSpeedVal);
  btnStart.addEventListener("click", () => frame.setRunning(!appState.running));
  btnReset.addEventListener("click", () => frame.resetSimTimeAndLC({ resetNoise: true }));
  btnClearLC.addEventListener("click", () => {
    plot.clear();
    appState.lastPlottedT = Number.NaN;
    appState.lastPlotMode = null;
  });

  btnApplyParams.addEventListener("click", () => {
    if (isBinaryModeActive(uiRefs) && !appState.binaryLabState.hypothesis) {
      if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    runWithErrorHandling(
      () =>
        withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
          appState.params = ensureDidacticsConfig(readUIIntoParams(appState.params, uiRefs, appState.scenarioDefaults));
          appState.didacticsRuntime = initDidacticsRuntime(appState.params, appState.t);
          syncAllEnableStates(uiRefs);
          await rebuildSimulationFromParams();
          frame.resetSimTimeAndLC({ resetNoise: true });
          syncBinaryUi();
        }),
      { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
    );
  });

  btnResetParams.addEventListener("click", () => {
    if (isBinaryModeActive(uiRefs) && !appState.binaryLabState.hypothesis) {
      if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    runWithErrorHandling(
      () =>
        withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
          appState.params = ensureDidacticsConfig(cloneParams(appState.scenarioDefaults));
          appState.didacticsRuntime = initDidacticsRuntime(appState.params, appState.t);
          syncAllEnableStates(uiRefs);
          syncSliderMirrorsFromInputs();
          syncDidacticsControlsFromParams(appState.params, uiRefs);
          await rebuildSimulationFromParams();
          frame.resetSimTimeAndLC({ resetNoise: true });
          syncBinaryUi();
        }),
      { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
    );
  });

  presetSelect.replaceChildren();
  for (const preset of PRESETS) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    presetSelect.appendChild(opt);
  }
  presetSelect.value = "default";
  presetDesc.textContent = getPresetById(presetSelect.value).description;
  presetSelect.addEventListener("change", () => {
    if (simModeSelect && simModeSelect.value !== PRESET_MODE_VALUE) simModeSelect.value = PRESET_MODE_VALUE;
    if (realSystemSelect) realSystemSelect.value = "";
    if (realSystemMeta) realSystemMeta.textContent = "";
    runWithErrorHandling(() => applyActive(), {
      statusEl: warnVal,
      getSuccessMessage: () => uiWarningText(appState.params) ?? "",
    });
  });

  if (realSystemSelect) {
    realSystemSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— choose real system —";
    realSystemSelect.appendChild(placeholder);
    for (const sys of REAL_SYSTEMS_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = sys.id;
      opt.textContent = sys.label;
      realSystemSelect.appendChild(opt);
    }
    realSystemSelect.value = "";
    realSystemSelect.disabled = REAL_SYSTEMS_OPTIONS.length === 0;
    if (realSystemMeta) realSystemMeta.textContent = "";
    realSystemSelect.addEventListener("change", () => {
      if (simModeSelect && simModeSelect.value !== PRESET_MODE_VALUE) simModeSelect.value = PRESET_MODE_VALUE;
      if (!realSystemSelect.value && realSystemMeta) realSystemMeta.textContent = "";
      runWithErrorHandling(() => applyActive(), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    });
  }

  if (simModeSelect) {
    simModeSelect.value = BINARY_MODE_VALUE;
    simModeSelect.addEventListener("change", () => {
      runWithErrorHandling(() => applyActive(), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    });
  }

  if (runtimeModeSelect) {
    runtimeModeSelect.value = "realtime";
    runtimeModeSelect.addEventListener("change", () => {
      runWithErrorHandling(
        () =>
          withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
            await rebuildSimulationFromParams();
            frame.resetSimTimeAndLC({ resetNoise: false });
          }),
        { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
      );
    });
  }

  populateDidacticsControls(uiRefs);
  syncDidacticsControlsFromParams(appState.params, uiRefs);
  if (didComparePreset) {
    didComparePreset.replaceChildren();
    for (const preset of PRESETS) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.label;
      didComparePreset.appendChild(opt);
    }
    didComparePreset.value = "nbody-with-perturber";
  }

  didLessonSelect?.addEventListener("change", () => {
    appState.params = ensureDidacticsConfig(appState.params);
    appState.params = {
      ...appState.params,
      didactics: { ...appState.params.didactics!, activeLessonId: didLessonSelect.value },
    };
    appState.didacticsRuntime = initDidacticsRuntime(appState.params, appState.t);
    renderDidacticSignals(uiRefs, appState.didacticsRuntime);
  });
  didAutoAssess?.addEventListener("input", () => {
    appState.params = ensureDidacticsConfig(appState.params);
    appState.params = {
      ...appState.params,
      didactics: { ...appState.params.didactics!, autoAssess: didAutoAssess.checked },
    };
  });
  didCheckBtn?.addEventListener("click", () => {
    runWithErrorHandling(
      () => {
        const step = simulation.step(appState.t);
        appState.didacticsRuntime = onDidacticSignals(
          appState.params,
          appState.didacticsRuntime,
          step.didactics?.signals,
          appState.t,
        );
        renderDidacticSignals(uiRefs, appState.didacticsRuntime);
      },
      { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
    );
  });
  didNextBtn?.addEventListener("click", () => {
    appState.didacticsRuntime = forceNextLessonStep(appState.params, appState.didacticsRuntime, appState.t);
    renderDidacticSignals(uiRefs, appState.didacticsRuntime);
  });
  didExportBtn?.addEventListener("click", () => {
    runWithErrorHandling(() => exportDidacticReport(appState.params, appState.didacticsRuntime), {
      statusEl: warnVal,
      getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      errorPrefix: "Export failed: ",
    });
  });
  didCompareBtn?.addEventListener("click", () => {
    runWithErrorHandling(
      () => {
        const presetB = getPresetById(didComparePreset?.value ?? "default");
        const tCmp = Number(didCompareTime?.value ?? "0");
        const cmp = compareScenariosAtTime(
          appState.params,
          cloneParams(presetB.params),
          Number.isFinite(tCmp) ? tCmp : 0,
        );
        renderDidacticComparison(uiRefs, interpretDidacticComparison(cmp));
      },
      { statusEl: uiRefs.didCompareOut, errorPrefix: "Compare failed: " },
    );
  });

  didHypothesisSelect?.addEventListener("change", () => {
    const selected = didHypothesisSelect.value;
    if (isBinaryHypothesis(selected)) {
      appState.binaryLabState = setHypothesis(appState.binaryLabState, selected);
      if (warnVal) warnVal.textContent = "";
    } else {
      appState.binaryLabState = { ...appState.binaryLabState, hypothesis: undefined };
    }
    syncBinaryUi();
  });
  didRevealSkyBtn?.addEventListener("click", () => {
    appState.binaryLabState = revealSky(appState.binaryLabState);
    syncBinaryUi();
  });

  if (ocBodySelect) {
    ocBody = ocBodySelect.value === "moon" ? "moon" : "planet";
    ocBodySelect.addEventListener("change", () => {
      ocBody = ocBodySelect.value === "moon" ? "moon" : "planet";
      renderOcPanel();
    });
  }
  if (ocUnitSelect) {
    ocUnit = ocUnitSelect.value === "ms" ? "ms" : "s";
    ocUnitSelect.addEventListener("change", () => {
      ocUnit = ocUnitSelect.value === "ms" ? "ms" : "s";
      renderOcPanel();
    });
  }
  if (ocTrendModeSelect) {
    ocTrendMode =
      ocTrendModeSelect.value === "fit"
        ? "fit"
        : ocTrendModeSelect.value === "detrended"
          ? "detrended"
          : "raw";
    ocTrendModeSelect.addEventListener("change", () => {
      ocTrendMode =
        ocTrendModeSelect.value === "fit"
          ? "fit"
          : ocTrendModeSelect.value === "detrended"
            ? "detrended"
            : "raw";
      renderOcPanel();
    });
  }
  ocExportBtn?.addEventListener("click", () => {
    runWithErrorHandling(
      () => exportOcCsv(appState.transitHistory, ocBody, { unit: ocUnit, trendMode: ocTrendMode }),
      {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
        errorPrefix: "Export failed: ",
      },
    );
  });
  ocClearBtn?.addEventListener("click", () => {
    appState.transitHistory = resetTransitHistoryState(appState.transitHistory);
    if (timingHistoryVal) timingHistoryVal.textContent = formatTransitHistorySummary(appState.transitHistory);
    renderOcPanel();
  });

  wireParamSliders(uiRefs);
  wireEnableHandlers(uiRefs);
  wireDebugDOM(renderer);

  try {
    await applyActive();
    if (warnVal) warnVal.textContent = uiWarningText(appState.params) ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (warnVal) warnVal.textContent = `Startup: ${msg}`;
  }
  renderDidacticSignals(uiRefs, appState.didacticsRuntime);
  syncBinaryUi();
  renderOcPanel();
  requestAnimationFrame(frame.frame);
}
