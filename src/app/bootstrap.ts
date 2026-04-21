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
import { computeDidacticSignals } from "../didactics";
import { createBinaryLabState } from "../didactics/binaryLab";
import { setDidacticsHook } from "../sim/didacticsHook";
import { createUiRefs } from "../ui/refs";
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

// AppState merges scenario-flow and frame-loop state shapes.
type AppState = ScenarioFlowState & FrameLoopState;

let activeAppDispose: (() => void) | null = null;

// ── DOM population helpers ────────────────────────────────────────────────────

function populatePresetSelect(presetSelect: HTMLSelectElement, presetDesc: HTMLElement): void {
  presetSelect.replaceChildren();
  for (const preset of PRESETS) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    presetSelect.appendChild(opt);
  }
  presetSelect.value = "default";
  presetDesc.textContent = getPresetById(presetSelect.value).description;
}

function populateRealSystemSelect(
  realSystemSelect: HTMLSelectElement,
  realSystemMeta: HTMLElement | null,
): void {
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
}

// ─────────────────────────────────────────────────────────────────────────────

export async function initApp(): Promise<void> {
  activeAppDispose?.();
  activeAppDispose = null;

  const refs = createUiRefs();
  const teardownController = new AbortController();
  const listenerOptions = { signal: teardownController.signal };

  // Wire didactics hook so sim/ can call it without importing didactics/ directly.
  setDidacticsHook(computeDidacticSignals);

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
  } = refs;

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
    fixedPlotYRange: undefined,
    fixedPlotYRangeMode: null,
    transitHistory: createTransitHistoryState(),
    physicalHistory: [],
    measuredHistory: [],
    componentBaselineHistory: [],
    componentTransitHistory: [],
    componentScatterHistory: [],
    comparisonCurveSeries: undefined,
    comparisonInset: undefined,
    comparisonGhosts: undefined,
    comparisonBadges: undefined,
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
    return isBinaryModeActive(refs) ? "binary-lab" : "preset-lab";
  }

  function runtimeArgsFromCurrentParams() {
    return {
      system: appState.params,
      binaryMode: isBinaryModeActive(refs),
      runtimeMode: readRuntimeModeFromUi(),
      binaryLabDefaults: DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
    };
  }

  let simulation: AppSimulationRuntime = createSimulationRuntimeV4FromParams(runtimeArgsFromCurrentParams());
  let disposed = false;
  let quickApplyTimer: ReturnType<typeof setTimeout> | null = null;

  function syncDisplayFluxState(): void {
    const cfg = simulation.getConfig();
    appState.displayFluxScale = binaryFluxDisplayBaseline(cfg) ?? 1;
    appState.displayFluxTitle = fluxDisplayTitle(cfg);
  }

  syncDisplayFluxState();

  const { renderOcPanel, wireOcControls } = createBootstrapOcPanelController({
    refs,
    state: appState,
    warnEl: warnVal,
    getSuccessMessage: () => uiWarningText(appState.params) ?? "",
    signal: teardownController.signal,
  });

  function renderDidacticsSurface(): void {
    if (isLabProductModeActive(refs)) {
      renderDidacticSignals(refs, appState.didacticsRuntime);
      return;
    }
    renderDidacticSignals(refs, {
      ...appState.didacticsRuntime,
      latestSignals: undefined,
      latestTiming: undefined,
    });
  }

  const frame = createFrameLoopController({
    refs,
    renderer,
    plot,
    state: appState,
    getSimulation: () => simulation,
    getParams: () => appState.params,
    getBinaryLabState: () => appState.binaryLabState,
    isBinaryModeActive: () => isBinaryModeActive(refs),
    uiWarningText,
    onSampleStep: (step, tSec) => {
      if (isLabProductModeActive(refs)) {
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

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (quickApplyTimer !== null) {
      clearTimeout(quickApplyTimer);
      quickApplyTimer = null;
    }
    teardownController.abort();
    frame.dispose();
    simulation.dispose();
    if (activeAppDispose === dispose) activeAppDispose = null;
  };

  activeAppDispose = dispose;

  async function rebuildSimulationFromParams(): Promise<void> {
    if (disposed) return;
    const nextSimulation = await replaceRuntime(simulation, runtimeArgsFromCurrentParams());
    if (disposed) {
      nextSimulation.dispose();
      return;
    }
    simulation = nextSimulation;
    syncDisplayFluxState();
    const status = takeRuntimeStatus(simulation);
    if (status && warnVal) warnVal.textContent = status;
  }

  const scenarioDeps: ScenarioFlowDeps = {
    refs,
    state: appState,
    getTimeSec: () => appState.t,
    rebuildSimulationFromParams,
    resetSimTimeAndLC: frame.resetSimTimeAndLC,
  };
  const applyGuard: ScenarioApplyGuard = { applying: false };

  function syncBinaryUi(): void {
    syncBinaryLabUiState(refs, appState.binaryLabState);
  }

  async function applyActive(): Promise<void> {
    if (disposed) return;
    await withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
      await applyActiveScenarioForMode(scenarioDeps);
      syncBinaryUi();
    });
  }

  async function applyCurrentUiParams(resetNoise = true): Promise<void> {
    if (disposed) return;
    if (isBinaryModeActive(refs) && !appState.binaryLabState.hypothesis) {
      if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    await withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
      const nextParams = readUIIntoParams(appState.params, refs, appState.scenarioDefaults);
      await applyScenarioParams(scenarioDeps, nextParams, { syncUi: false, resetNoise });
      syncBinaryUi();
    });
  }

  function scheduleNormalModeQuickApply(): void {
    if (disposed) return;
    if (readUiMode(uiModeSelect.value) !== "normal") return;
    if (quickApplyTimer !== null) clearTimeout(quickApplyTimer);
    quickApplyTimer = setTimeout(() => {
      quickApplyTimer = null;
      if (disposed) return;
      runWithErrorHandling(() => applyCurrentUiParams(true), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    }, 120);
  }

  wireBootstrapViewControls({ refs, renderer, plot, signal: teardownController.signal });
  let syncDebugDom = (): void => {};
  productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
  syncProductModeVisibility(readProductMode(productModeSelect.value));
  uiModeSelect.value = "normal";
  syncUiModeVisibility(readUiMode(uiModeSelect.value));
  uiModeSelect.addEventListener(
    "change",
    () => {
      const nextMode = readUiMode(uiModeSelect.value);
      syncUiModeVisibility(nextMode);
      syncDebugDom();

      if (nextMode !== "normal") return;

      if (runtimeModeSelect) runtimeModeSelect.value = "realtime";
      runWithErrorHandling(
        () =>
          withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
            applyObserverModeContract(appState.params, nextMode);
            await applyScenarioParams(scenarioDeps, appState.params, { syncUi: true, resetNoise: false });
            syncBinaryUi();
          }),
        { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
      );
    },
    listenerOptions,
  );
  productModeSelect.addEventListener(
    "change",
    () => {
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
    },
    listenerOptions,
  );
  btnStart.addEventListener("click", () => frame.setRunning(!appState.running), listenerOptions);
  btnReset.addEventListener("click", () => frame.resetSimTimeAndLC({ resetNoise: true }), listenerOptions);
  btnClearLC.addEventListener(
    "click",
    () => {
      plot.clear();
      plot.setOptions({ manualYRange: undefined });
      appState.lastPlottedT = Number.NaN;
      appState.lastPlotMode = null;
      appState.fixedPlotYRange = undefined;
      appState.fixedPlotYRangeMode = null;
    },
    listenerOptions,
  );

  btnApplyParams.addEventListener(
    "click",
    () => {
      runWithErrorHandling(() => applyCurrentUiParams(true), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    },
    listenerOptions,
  );

  btnResetParams.addEventListener(
    "click",
    () => {
      if (isBinaryModeActive(refs) && !appState.binaryLabState.hypothesis) {
        if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
        return;
      }
      runWithErrorHandling(
        () =>
          withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
            await applyScenarioParams(scenarioDeps, appState.scenarioDefaults, {
              syncUi: true,
              resetNoise: true,
            });
            syncBinaryUi();
          }),
        { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
      );
    },
    listenerOptions,
  );

  populatePresetSelect(presetSelect, presetDesc);
  presetSelect.addEventListener(
    "change",
    () => {
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
    },
    listenerOptions,
  );

  if (realSystemSelect) {
    populateRealSystemSelect(realSystemSelect, realSystemMeta ?? null);
    realSystemSelect.addEventListener(
      "change",
      () => {
        if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
          productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
          syncProductModeVisibility("simulation");
        }
        if (!realSystemSelect.value && realSystemMeta) realSystemMeta.textContent = "";
        runWithErrorHandling(() => applyActive(), {
          statusEl: warnVal,
          getSuccessMessage: () => uiWarningText(appState.params) ?? "",
        });
      },
      listenerOptions,
    );
  }

  if (simModeSelect) {
    simModeSelect.value = PRESET_MODE_VALUE;
    simModeSelect.addEventListener(
      "change",
      () => {
        if (!isLabProductModeActive(refs)) {
          productModeSelect.value = LAB_PRODUCT_MODE_VALUE;
          syncProductModeVisibility("lab");
          uiModeSelect.value = "normal";
          syncUiModeVisibility("normal");
        }
        runWithErrorHandling(() => applyActive(), {
          statusEl: warnVal,
          getSuccessMessage: () => uiWarningText(appState.params) ?? "",
        });
      },
      listenerOptions,
    );
  }

  if (runtimeModeSelect) {
    runtimeModeSelect.value = "realtime";
    runtimeModeSelect.addEventListener(
      "change",
      () => {
        runWithErrorHandling(
          () =>
            withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
              await rebuildSimulationFromParams();
              frame.resetSimTimeAndLC({ resetNoise: false });
            }),
          { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
        );
      },
      listenerOptions,
    );
  }

  wireDidacticsUi({
    refs,
    state: appState,
    getSimulation: () => simulation,
    currentLessonSimMode,
    seekToTime: frame.seekToTime,
    syncBinaryUi,
    warnEl: warnVal,
    getSuccessMessage: () => uiWarningText(appState.params) ?? "",
    signal: teardownController.signal,
  });

  wireOcControls();

  wireParamSliders(refs, { signal: teardownController.signal });
  wireEnableHandlers(refs, { signal: teardownController.signal });
  wireNormalModeQuickControls(refs, {
    onQuickControlChange: scheduleNormalModeQuickApply,
    signal: teardownController.signal,
  });
  syncDebugDom = wireDebugDOM(renderer, teardownController.signal);

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
  if (!disposed) frame.start();
}
