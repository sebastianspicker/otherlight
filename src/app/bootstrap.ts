import type { RuntimeModeV4 } from "../sim/v4";
import { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import { cloneParams } from "./scenario";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "./binaryLab";
import { PRESETS, getPresetById } from "./presets";
import { REAL_SYSTEMS_OPTIONS } from "./realSystems";
import { wireDebugDOM } from "./debug";
import { runWithErrorHandling } from "./runWithErrorHandling";
import {
  createSimulationRuntimeV4FromParams,
  stripUnsupportedPhotometryForV4Runtime,
  type AppSimulationRuntime,
} from "./v4Runtime";
import { uiWarningText } from "./warnings";
import { initNoiseState } from "./noise";
import {
  createTransitHistoryState,
  formatTransitHistorySummary,
  updateTransitHistoryFromStep,
} from "./transitHistory";
import {
  ensureDidacticsConfig,
  initDidacticsRuntime,
  onDidacticSignals,
  renderDidacticSignals,
} from "./didactics";
import { computeDidacticSignals, evaluateDidacticsV3 } from "../didactics";
import { createBinaryLabState } from "../didactics/binaryLab";
import { setDidacticsHook, setDidacticsV3Hook } from "../sim/didacticsHook";
import { uiRefs } from "../ui/refs";
import { readUIIntoParams } from "../ui/params";
import { wireEnableHandlers } from "../ui/enable";
import { applyObserverModeContract, readUiMode, syncUiModeVisibility } from "../ui/mode";
import { readProductMode, syncProductModeVisibility } from "../ui/productMode";
import { wireNormalModeQuickControls } from "../ui/quickControls";
import { wireParamSliders } from "../ui/sliders";
import { binaryFluxDisplayBaseline, fluxDisplayTitle } from "./displayFlux";
import {
  applyActiveScenarioForMode,
  applyScenarioParams,
  isBinaryModeActive,
  isLabProductModeActive,
  LAB_PRODUCT_MODE_VALUE,
  PRESET_MODE_VALUE,
  SIMULATION_PRODUCT_MODE_VALUE,
  syncBinaryLabUiState,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";
import { createFrameLoopController, type FrameLoopState } from "./frameLoop";
import { wireDidacticsUi } from "./didacticsWiring";
import { replaceRuntime, takeRuntimeStatus } from "./runtimeLifecycle";
import { wireBootstrapViewControls } from "./bootstrapViewControls";
import { createBootstrapOcPanelController } from "./bootstrapOcPanel";

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
    productModeSelect,
    uiModeSelect,
    simModeSelect,
    runtimeModeSelect,
    presetSelect,
    presetDesc,
    realSystemSelect,
    realSystemMeta,
    warnVal,
    timingHistoryVal,
    btnApplyParams,
    btnResetParams,
  } = uiRefs;

  const defaultPreset = getPresetById("default");
  const defaultScenario = stripUnsupportedPhotometryForV4Runtime(defaultPreset.params);
  const renderer = new Canvas2DRenderer(skyCanvas, { autoFitScene: false });
  const plot = new LightCurvePlot(lcCanvas, 900, { xMode: "time", trackingMode: "dynamic" });

  const appState: AppState = {
    scenarioDefaults: cloneParams(defaultScenario),
    params: cloneParams(defaultScenario),
    didacticsRuntime: initDidacticsRuntime(cloneParams(defaultScenario), 0),
    noise: initNoiseState(cloneParams(defaultScenario)),
    binaryLabState: createBinaryLabState(DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab),
    running: false,
    t: 0,
    last: performance.now(),
    lastPlottedT: Number.NaN,
    lastPlotMode: null,
    lastPlotTrackingMode: null,
    lastFluxForPlot: 1,
    lastStepV3: null,
    displayFluxScale: 1,
    displayFluxTitle: "Flux (stellar units)",
    transitHistory: createTransitHistoryState(),
  };
  appState.scenarioDefaults = ensureDidacticsConfig(cloneParams(appState.scenarioDefaults));
  appState.params = ensureDidacticsConfig(cloneParams(appState.scenarioDefaults));
  applyObserverModeContract(appState.scenarioDefaults, "normal");
  applyObserverModeContract(appState.params, "normal");
  appState.didacticsRuntime = initDidacticsRuntime(appState.params, 0);
  appState.noise = initNoiseState(appState.params);

  function readRuntimeModeFromUi(): RuntimeModeV4 {
    return runtimeModeSelect?.value === "reference" ? "reference" : "realtime";
  }

  function currentLessonSimMode(): "preset-lab" | "binary-lab" {
    return isBinaryModeActive(uiRefs) ? "binary-lab" : "preset-lab";
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

  function syncDisplayFluxState(): void {
    const cfg = simulation.getConfig();
    appState.displayFluxScale = binaryFluxDisplayBaseline(cfg) ?? 1;
    appState.displayFluxTitle = fluxDisplayTitle(cfg);
  }

  syncDisplayFluxState();

  const { renderOcPanel, wireOcControls } = createBootstrapOcPanelController({
    refs: uiRefs,
    state: appState,
    warnEl: warnVal,
    getSuccessMessage: () => uiWarningText(appState.params) ?? "",
  });

  async function rebuildSimulationFromParams(): Promise<void> {
    simulation = await replaceRuntime(simulation, runtimeArgsFromCurrentParams());
    syncDisplayFluxState();
    const status = takeRuntimeStatus(simulation);
    if (status && warnVal) warnVal.textContent = status;
  }

  function renderDidacticsSurface(): void {
    if (isLabProductModeActive(uiRefs)) {
      renderDidacticSignals(uiRefs, appState.didacticsRuntime);
      return;
    }
    renderDidacticSignals(uiRefs, {
      ...appState.didacticsRuntime,
      latestSignals: undefined,
      latestTiming: undefined,
    });
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
      if (isLabProductModeActive(uiRefs)) {
        appState.didacticsRuntime = onDidacticSignals(
          appState.params,
          appState.didacticsRuntime,
          step.didactics?.signals,
          step.timing,
          tSec,
        );
      }
      renderDidacticsSurface();
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
  let quickApplyTimer: ReturnType<typeof setTimeout> | null = null;

  function syncBinaryUi(): void {
    syncBinaryLabUiState(uiRefs, appState.binaryLabState);
  }

  async function applyActive(): Promise<void> {
    await withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
      await applyActiveScenarioForMode(scenarioDeps);
      syncBinaryUi();
    });
  }

  async function applyCurrentUiParams(resetNoise = true): Promise<void> {
    if (isBinaryModeActive(uiRefs) && !appState.binaryLabState.hypothesis) {
      if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    await withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
      const nextParams = readUIIntoParams(appState.params, uiRefs, appState.scenarioDefaults);
      await applyScenarioParams(scenarioDeps, nextParams, { syncUi: false, resetNoise });
      syncBinaryUi();
    });
  }

  function scheduleNormalModeQuickApply(): void {
    if (readUiMode(uiModeSelect.value) !== "normal") return;
    if (quickApplyTimer !== null) clearTimeout(quickApplyTimer);
    quickApplyTimer = setTimeout(() => {
      quickApplyTimer = null;
      runWithErrorHandling(() => applyCurrentUiParams(true), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    }, 120);
  }

  wireBootstrapViewControls({ refs: uiRefs, renderer, plot });
  let syncDebugDom = (): void => {};
  productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
  syncProductModeVisibility(readProductMode(productModeSelect.value));
  uiModeSelect.value = "normal";
  syncUiModeVisibility(readUiMode(uiModeSelect.value));
  uiModeSelect.addEventListener("change", () => {
    const nextMode = readUiMode(uiModeSelect.value);
    syncUiModeVisibility(nextMode);
    syncDebugDom();

    if (nextMode !== "normal") return;

    if (runtimeModeSelect) runtimeModeSelect.value = "realtime";
    runWithErrorHandling(
      () =>
        withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
          applyObserverModeContract(appState.params, nextMode);
          await applyScenarioParams(scenarioDeps, appState.params, { syncUi: true, resetNoise: false });
          syncBinaryUi();
        }),
      { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
    );
  });
  productModeSelect.addEventListener("change", () => {
    const nextProductMode = readProductMode(productModeSelect.value);
    syncProductModeVisibility(nextProductMode);
    if (nextProductMode === LAB_PRODUCT_MODE_VALUE) {
      uiModeSelect.value = "normal";
      syncUiModeVisibility("normal");
      syncDebugDom();
      if (runtimeModeSelect) runtimeModeSelect.value = "realtime";
      if (simModeSelect && !simModeSelect.value) simModeSelect.value = PRESET_MODE_VALUE;
    }
    renderDidacticsSurface();
    runWithErrorHandling(() => applyActive(), {
      statusEl: warnVal,
      getSuccessMessage: () => uiWarningText(appState.params) ?? "",
    });
  });
  btnStart.addEventListener("click", () => frame.setRunning(!appState.running));
  btnReset.addEventListener("click", () => frame.resetSimTimeAndLC({ resetNoise: true }));
  btnClearLC.addEventListener("click", () => {
    plot.clear();
    appState.lastPlottedT = Number.NaN;
    appState.lastPlotMode = null;
  });

  btnApplyParams.addEventListener("click", () => {
    runWithErrorHandling(() => applyCurrentUiParams(true), {
      statusEl: warnVal,
      getSuccessMessage: () => uiWarningText(appState.params) ?? "",
    });
  });

  btnResetParams.addEventListener("click", () => {
    if (isBinaryModeActive(uiRefs) && !appState.binaryLabState.hypothesis) {
      if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    runWithErrorHandling(
      () =>
        withScenarioApplyGuard(applyGuard, uiRefs, warnVal, async () => {
          await applyScenarioParams(scenarioDeps, appState.scenarioDefaults, {
            syncUi: true,
            resetNoise: true,
          });
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
    if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
      productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
      syncProductModeVisibility("simulation");
    }
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
      if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
        productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
        syncProductModeVisibility("simulation");
      }
      if (!realSystemSelect.value && realSystemMeta) realSystemMeta.textContent = "";
      runWithErrorHandling(() => applyActive(), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    });
  }

  if (simModeSelect) {
    simModeSelect.value = PRESET_MODE_VALUE;
    simModeSelect.addEventListener("change", () => {
      if (!isLabProductModeActive(uiRefs)) {
        productModeSelect.value = LAB_PRODUCT_MODE_VALUE;
        syncProductModeVisibility("lab");
        uiModeSelect.value = "normal";
        syncUiModeVisibility("normal");
      }
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

  wireDidacticsUi({
    refs: uiRefs,
    state: appState,
    getSimulation: () => simulation,
    currentLessonSimMode,
    seekToTime: frame.seekToTime,
    syncBinaryUi,
    warnEl: warnVal,
    getSuccessMessage: () => uiWarningText(appState.params) ?? "",
  });

  wireOcControls();

  wireParamSliders(uiRefs);
  wireEnableHandlers(uiRefs);
  wireNormalModeQuickControls(uiRefs, { onQuickControlChange: scheduleNormalModeQuickApply });
  syncDebugDom = wireDebugDOM(renderer);

  try {
    await applyActive();
    if (warnVal) warnVal.textContent = uiWarningText(appState.params) ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (warnVal) warnVal.textContent = `Startup: ${msg}`;
  }
  renderDidacticsSurface();
  syncBinaryUi();
  renderOcPanel();
  requestAnimationFrame(frame.frame);
}
