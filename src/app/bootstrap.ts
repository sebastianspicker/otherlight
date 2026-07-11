import type { RuntimeModeV4 } from "../sim/v4";
import { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import { cloneParams } from "./scenario";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "./binaryLab";
import { getPresetById } from "./presets";
import { wireDebugDOM } from "./debug";
import { runWithErrorHandling } from "./runWithErrorHandling";
import {
  createSimulationRuntimeV4FromParams,
  cloneParamsForV4Runtime,
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
import { clearParamValidationUi, readValidatedUIIntoParams, renderParamValidationErrors } from "../ui/params";
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
import { parseProductViewState, productViewStateSearch } from "../ui/productViewState";
import { createBootstrapDirtyGuard } from "./bootstrapDirtyGuard";
import { wireBootstrapLightCurveActions } from "./bootstrapLightCurveActions";
import {
  initializeProductViewControls,
  readProductViewStateFromControls,
  syncProductModeNavigation,
} from "./bootstrapProductSetup";
type AppState = ScenarioFlowState & FrameLoopState;
let activeAppDispose: (() => void) | null = null;

export async function initApp(): Promise<void> {
  activeAppDispose?.();
  activeAppDispose = null;

  const refs = createUiRefs();
  const teardownController = new AbortController();
  const listenerOptions = { signal: teardownController.signal };

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
  const appStatus = document.getElementById("appStatus");
  const appStatusMessage = document.getElementById("appStatusMessage");
  const appRetryBtn = document.getElementById("appRetryBtn") as HTMLButtonElement | null;
  const paramForm = document.getElementById("paramForm") as HTMLFormElement | null;
  const paramErrorSummary = document.getElementById("paramErrorSummary");
  const paramDirtyState = document.getElementById("paramDirtyState");
  const dirtyDialog = document.getElementById("dirtyChangeDialog") as HTMLDialogElement | null;
  const dirtyKeepEditingBtn = document.getElementById("dirtyKeepEditingBtn") as HTMLButtonElement | null;
  const dirtyDiscardBtn = document.getElementById("dirtyDiscardBtn") as HTMLButtonElement | null;
  const modeSimulationBtn = document.getElementById("modeSimulationBtn") as HTMLButtonElement | null;
  const modeLabBtn = document.getElementById("modeLabBtn") as HTMLButtonElement | null;
  const lcExportBtn = document.getElementById("lcExportBtn") as HTMLButtonElement | null;
  const btnUndoClearLC = document.getElementById("btnUndoClearLC") as HTMLButtonElement | null;
  const setAppStatus = (message: string): void => {
    if (appStatusMessage) appStatusMessage.textContent = message;
    else if (appStatus) appStatus.textContent = message;
  };
  const parsedInitialView = initializeProductViewControls({
    productModeSelect,
    uiModeSelect,
    simModeSelect,
    runtimeModeSelect,
    presetSelect,
    presetDesc,
    realSystemSelect,
    realSystemMeta,
  });
  const initialView = parsedInitialView.state;
  if (parsedInitialView.corrections.length > 0) {
    setAppStatus(`Some shared settings were corrected. ${parsedInitialView.corrections.join(" ")}`);
  }

  const defaultPreset = getPresetById("default");
  const defaultScenario = cloneParamsForV4Runtime(defaultPreset.params);
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

  let restoringHistory = false;

  function syncModeNavigation(): void {
    syncProductModeNavigation(productModeSelect, modeSimulationBtn, modeLabBtn);
  }

  function writeProductHistory(kind: "push" | "replace"): void {
    if (typeof window === "undefined" || restoringHistory) return;
    const search = productViewStateSearch(
      readProductViewStateFromControls({
        productModeSelect,
        uiModeSelect,
        simModeSelect,
        runtimeModeSelect,
        presetSelect,
        realSystemSelect,
        lessonSelect: refs.didLessonSelect,
        fallbackLesson: initialView.lesson,
      }),
      new URLSearchParams(window.location.search),
    );
    const nextUrl = `${window.location.pathname}?${search}${window.location.hash}`;
    try {
      if (kind === "push") window.history.pushState(null, "", nextUrl);
      else window.history.replaceState(null, "", nextUrl);
    } catch {
      return;
    }
  }

  const dirtyGuard = createBootstrapDirtyGuard({
    form: paramForm,
    uiModeSelect,
    dirtyState: paramDirtyState,
    dialog: dirtyDialog,
    keepEditingButton: dirtyKeepEditingBtn,
    discardButton: dirtyDiscardBtn,
    applyButton: btnApplyParams,
    clearValidation: () => {
      if (paramForm) clearParamValidationUi(paramForm, paramErrorSummary);
    },
    signal: teardownController.signal,
  });
  const setParamsDirty = dirtyGuard.setDirty;
  const requestContextChange = dirtyGuard.requestContextChange;
  dirtyGuard.guardContextSelect(presetSelect);
  dirtyGuard.guardContextSelect(realSystemSelect);
  dirtyGuard.guardContextSelect(simModeSelect);
  syncModeNavigation();

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (quickApplyTimer !== null) {
      clearTimeout(quickApplyTimer);
      quickApplyTimer = null;
    }
    teardownController.abort();
    frame.dispose();
    renderer.dispose();
    plot.dispose();
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
  let retryScenario: (() => Promise<void>) | null = null;

  function syncBinaryUi(): void {
    syncBinaryLabUiState(refs, appState.binaryLabState);
  }

  async function applyActive(): Promise<void> {
    if (disposed) return;
    try {
      await withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
        await applyActiveScenarioForMode(scenarioDeps);
        syncBinaryUi();
      });
      retryScenario = null;
      if (appRetryBtn) appRetryBtn.hidden = true;
    } catch (error) {
      retryScenario = applyActive;
      if (appRetryBtn) appRetryBtn.hidden = false;
      setAppStatus(
        "The selected scenario could not be loaded. The last valid simulation is preserved; retry is available.",
      );
      throw error;
    }
  }

  appRetryBtn?.addEventListener(
    "click",
    () => {
      if (!retryScenario) return;
      runWithErrorHandling(() => retryScenario?.(), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "Scenario loaded.",
        errorPrefix: "Retry failed: ",
      });
    },
    listenerOptions,
  );

  async function applyCurrentUiParams(resetNoise = true): Promise<void> {
    if (disposed) return;
    if (isBinaryModeActive(refs) && !appState.binaryLabState.hypothesis) {
      if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    await withScenarioApplyGuard(applyGuard, refs, warnVal, async () => {
      if (!paramForm) throw new Error("Parameter form is unavailable.");
      const result = readValidatedUIIntoParams(appState.params, refs, appState.scenarioDefaults, paramForm);
      if (!result.ok) {
        renderParamValidationErrors(paramForm, result.errors, paramErrorSummary);
        throw new Error(
          `Parameters were not applied. Fix ${result.errors.length} highlighted ${result.errors.length === 1 ? "error" : "errors"}.`,
        );
      }
      await applyScenarioParams(scenarioDeps, result.params, { syncUi: false, resetNoise });
      clearParamValidationUi(paramForm, paramErrorSummary);
      setParamsDirty(false);
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
  syncProductModeVisibility(readProductMode(productModeSelect.value));
  syncUiModeVisibility(readUiMode(uiModeSelect.value));
  uiModeSelect.addEventListener(
    "change",
    () => {
      const nextMode = readUiMode(uiModeSelect.value);
      syncUiModeVisibility(nextMode);
      syncDebugDom();
      writeProductHistory("replace");

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
      syncModeNavigation();
      writeProductHistory("push");
      setAppStatus(
        nextProductMode === "lab" ? "Guided Labs workspace selected." : "Simulation workspace selected.",
      );
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
  modeSimulationBtn?.addEventListener(
    "click",
    () => {
      if (productModeSelect.value === "simulation") return;
      requestContextChange(() => {
        productModeSelect.value = "simulation";
        productModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    listenerOptions,
  );
  modeLabBtn?.addEventListener(
    "click",
    () => {
      if (productModeSelect.value === "lab") return;
      requestContextChange(() => {
        productModeSelect.value = "lab";
        productModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    listenerOptions,
  );
  btnStart.addEventListener("click", () => frame.setRunning(!appState.running), listenerOptions);
  btnReset.addEventListener("click", () => frame.resetSimTimeAndLC({ resetNoise: true }), listenerOptions);
  wireBootstrapLightCurveActions({
    plot,
    state: appState,
    clearButton: btnClearLC,
    undoButton: btnUndoClearLC,
    exportButton: lcExportBtn,
    plotMode: refs.plotMode,
    invalidate: frame.invalidate,
    setStatus: setAppStatus,
    signal: teardownController.signal,
  });

  paramForm?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
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
            if (paramForm) clearParamValidationUi(paramForm, paramErrorSummary);
            setParamsDirty(false);
            syncBinaryUi();
          }),
        { statusEl: warnVal, getSuccessMessage: () => uiWarningText(appState.params) ?? "" },
      );
    },
    listenerOptions,
  );

  presetSelect.addEventListener(
    "change",
    () => {
      if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
        productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
        syncProductModeVisibility("simulation");
      }
      if (realSystemSelect) realSystemSelect.value = "";
      if (realSystemMeta) realSystemMeta.textContent = "";
      syncModeNavigation();
      writeProductHistory("push");
      runWithErrorHandling(() => applyActive(), {
        statusEl: warnVal,
        getSuccessMessage: () => uiWarningText(appState.params) ?? "",
      });
    },
    listenerOptions,
  );

  if (realSystemSelect) {
    realSystemSelect.addEventListener(
      "change",
      () => {
        if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
          productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
          syncProductModeVisibility("simulation");
        }
        if (!realSystemSelect.value && realSystemMeta) realSystemMeta.textContent = "";
        syncModeNavigation();
        writeProductHistory("push");
        runWithErrorHandling(() => applyActive(), {
          statusEl: warnVal,
          getSuccessMessage: () => uiWarningText(appState.params) ?? "",
        });
      },
      listenerOptions,
    );
  }

  if (simModeSelect) {
    simModeSelect.addEventListener(
      "change",
      () => {
        if (!isLabProductModeActive(refs)) {
          productModeSelect.value = LAB_PRODUCT_MODE_VALUE;
          syncProductModeVisibility("lab");
          uiModeSelect.value = "normal";
          syncUiModeVisibility("normal");
        }
        syncModeNavigation();
        writeProductHistory("push");
        runWithErrorHandling(() => applyActive(), {
          statusEl: warnVal,
          getSuccessMessage: () => uiWarningText(appState.params) ?? "",
        });
      },
      listenerOptions,
    );
  }

  if (runtimeModeSelect) {
    runtimeModeSelect.addEventListener(
      "change",
      () => {
        writeProductHistory("replace");
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
  refs.didLessonSelect?.addEventListener("change", () => writeProductHistory("push"), listenerOptions);

  window.addEventListener("resize", () => frame.invalidate(), { signal: teardownController.signal });
  document.getElementById("main")?.addEventListener("change", () => frame.invalidate(), listenerOptions);
  window.addEventListener(
    "popstate",
    () => {
      const parsed = parseProductViewState(new URLSearchParams(window.location.search));
      restoringHistory = true;
      productModeSelect.value = parsed.state.mode;
      uiModeSelect.value = parsed.state.ui === "advanced" ? "expert" : "normal";
      if (simModeSelect) simModeSelect.value = parsed.state.lab === "binary" ? "binary-lab" : "preset-lab";
      if (runtimeModeSelect)
        runtimeModeSelect.value = parsed.state.runtime === "reference" ? "reference" : "realtime";
      if (parsed.state.source === "real" && realSystemSelect) {
        realSystemSelect.value = Array.from(realSystemSelect.options).some(
          (option) => option.value === parsed.state.scenario,
        )
          ? parsed.state.scenario
          : "";
      } else {
        if (realSystemSelect) realSystemSelect.value = "";
        if (Array.from(presetSelect.options).some((option) => option.value === parsed.state.scenario)) {
          presetSelect.value = parsed.state.scenario;
        }
      }
      syncProductModeVisibility(readProductMode(productModeSelect.value));
      syncUiModeVisibility(readUiMode(uiModeSelect.value));
      syncModeNavigation();
      runWithErrorHandling(
        async () => {
          try {
            await applyActive();
            if (
              refs.didLessonSelect &&
              Array.from(refs.didLessonSelect.options).some((option) => option.value === parsed.state.lesson)
            ) {
              refs.didLessonSelect.value = parsed.state.lesson;
              refs.didLessonSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            setAppStatus(
              parsed.corrections.length > 0
                ? `History restored with corrections. ${parsed.corrections.join(" ")}`
                : "Shared context restored from browser history.",
            );
          } finally {
            restoringHistory = false;
          }
        },
        { statusEl: warnVal, errorPrefix: "Could not restore shared context: " },
      );
    },
    { signal: teardownController.signal },
  );

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
    if (
      refs.didLessonSelect &&
      Array.from(refs.didLessonSelect.options).some((option) => option.value === initialView.lesson)
    ) {
      restoringHistory = true;
      refs.didLessonSelect.value = initialView.lesson;
      refs.didLessonSelect.dispatchEvent(new Event("change", { bubbles: true }));
      restoringHistory = false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (warnVal) warnVal.textContent = `Startup: ${msg}`;
  }
  renderDidacticsSurface();
  syncBinaryUi();
  renderOcPanel();
  if (!disposed) {
    frame.start();
    writeProductHistory("replace");
    if (parsedInitialView.corrections.length === 0) {
      setAppStatus("Ready. Current context is reflected in the shareable URL.");
    }
  }
}
