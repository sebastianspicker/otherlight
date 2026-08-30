/** Composes one app instance and owns abortable cleanup across reinitialization. */
import { Canvas2DRenderer, LightCurvePlot } from "../presentation/render/canvas2d";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../application/binaryLab";
import { getPresetById } from "../application/presets";
import { wireDebugDOM } from "../presentation/controllers/debug";
import { createSimulationRuntimeV4FromParams, type AppSimulationRuntime } from "../application/v4Runtime";
import { cloneParams } from "../domain/model/clone";
import { uiWarningText } from "../application/warnings";
import { formatTransitHistorySummary, updateTransitHistoryFromStep } from "../application/transitHistory";
import { onDidacticSignals } from "../presentation/controllers/didactics";
import { computeDidacticSignals } from "../domain/education";
import { createUiRefs } from "../presentation/ui/refs";
import { clearParamValidationUi } from "../presentation/ui/params";
import { wireEnableHandlers } from "../presentation/ui/enable";
import { wireNormalModeQuickControls } from "../presentation/ui/quickControls";
import { wireParamSliders } from "../presentation/ui/sliders";
import { isBinaryModeActive, isLabProductModeActive } from "../presentation/controllers/scenarioFlow";
import { createFrameLoopController } from "../presentation/controllers/frameLoop";
import { wireDidacticsUi } from "../presentation/controllers/didacticsWiring";
import { wireBootstrapViewControls } from "../presentation/controllers/bootstrapViewControls";
import { createBootstrapOcPanelController } from "../presentation/controllers/bootstrapOcPanel";
import { createBootstrapDirtyGuard } from "../presentation/controllers/bootstrapDirtyGuard";
import { wireBootstrapLightCurveActions } from "../presentation/controllers/bootstrapLightCurveActions";
import {
  initializeProductViewControls,
  readProductViewStateFromControls,
  syncProductModeNavigation,
} from "../presentation/controllers/bootstrapProductSetup";
import { wireBootstrapProfile } from "../presentation/controllers/bootstrapProfile";
import { createProductHistoryWriter } from "../presentation/controllers/bootstrapProductHistory";
import { createBootstrapStatusWriter } from "../presentation/controllers/bootstrapStatus";
import {
  readBootstrapRuntimeMode,
  runtimeArgsFromBootstrapState,
  syncBootstrapDisplayFlux,
} from "../application/bootstrapRuntime";
import { renderBootstrapDidacticsSurface } from "../presentation/controllers/bootstrapDidacticsSurface";
import { wireBootstrapPersistence } from "../presentation/controllers/bootstrapPersistence";
import { createBootstrapAppState } from "../presentation/controllers/bootstrapAppState";
import { createBootstrapApplyParams } from "../presentation/controllers/bootstrapApplyParams";
import { wireBootstrapScenarioControls } from "../presentation/controllers/bootstrapScenarioControls";
import { wireBootstrapResetHandlers } from "../presentation/controllers/bootstrapResetHandlers";
import { finalizeBootstrapStartup } from "../presentation/controllers/bootstrapStartup";

let activeAppDispose: (() => void) | null = null;

export async function initApp(): Promise<void> {
  activeAppDispose?.();
  activeAppDispose = null;
  const refs = createUiRefs();
  const teardownController = new AbortController();
  const listenerOptions: AddEventListenerOptions = { signal: teardownController.signal };

  const {
    skyCanvas,
    lcCanvas,
    btnStart,
    btnReset,
    btnClearLC,
    productProfileSelect,
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
  const setAppStatus = createBootstrapStatusWriter(appStatus, appStatusMessage);
  const parsedInitialView = initializeProductViewControls({
    productProfileSelect,
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
  const defaultScenario = cloneParams(defaultPreset.params);
  const renderer = new Canvas2DRenderer(skyCanvas, { autoFitScene: false });
  const plot = new LightCurvePlot(lcCanvas, 900, { xMode: "time", trackingMode: "dynamic" });

  const appState = createBootstrapAppState(defaultScenario);

  const currentLessonSimMode = (): "preset-lab" | "binary-lab" =>
    isBinaryModeActive(refs) ? "binary-lab" : "preset-lab";

  const runtimeArgsFromCurrentParams = () =>
    runtimeArgsFromBootstrapState(
      appState.params,
      isBinaryModeActive(refs),
      readBootstrapRuntimeMode(runtimeModeSelect?.value),
      DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
      { computeDidacticSignals },
    );

  let simulation: AppSimulationRuntime = createSimulationRuntimeV4FromParams(runtimeArgsFromCurrentParams());
  let disposed = false;
  const syncDebugDom = { current: (): void => {} };

  const syncDisplayFluxState = () => syncBootstrapDisplayFlux(appState, simulation);

  syncDisplayFluxState();

  const { renderOcPanel, wireOcControls } = createBootstrapOcPanelController({
    refs,
    state: appState,
    warnEl: warnVal,
    getSuccessMessage: () => uiWarningText(appState.params) ?? "",
    signal: teardownController.signal,
  });

  const renderDidacticsSurface = () =>
    renderBootstrapDidacticsSurface(refs, appState.didacticsRuntime, isLabProductModeActive(refs));

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

  const syncModeNavigation = (): void =>
    syncProductModeNavigation(productModeSelect, modeSimulationBtn, modeLabBtn);

  const writeProductHistory = createProductHistoryWriter({
    isRestoring: () => restoringHistory,
    readState: () =>
      readProductViewStateFromControls({
        productProfileSelect,
        productModeSelect,
        uiModeSelect,
        simModeSelect,
        runtimeModeSelect,
        presetSelect,
        realSystemSelect,
        lessonSelect: refs.didLessonSelect,
        fallbackLesson: initialView.lesson,
      }),
  });

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
  dirtyGuard.guardContextSelect(uiModeSelect);
  syncModeNavigation();
  const profileController = wireBootstrapProfile({
    select: productProfileSelect,
    requestContextChange,
    pauseEducationRuntime: () => frame.setRunning(false),
    writeHistory: writeProductHistory,
    setStatus: setAppStatus,
    getScientificSystem: () => appState.params,
    isBinaryMode: () => isBinaryModeActive(refs),
    signal: teardownController.signal,
  });

  const applyParams = createBootstrapApplyParams({
    refs,
    state: appState,
    getTimeSec: () => appState.t,
    getSimulation: () => simulation,
    setSimulation: (next) => {
      simulation = next;
    },
    isDisposed: () => disposed,
    runtimeArgsFromCurrentParams,
    resetSimTimeAndLC: frame.resetSimTimeAndLC,
    syncDisplayFluxState,
    setParamsDirty,
    setAppStatus,
    warnEl: warnVal,
    appRetryBtn,
    paramForm,
    paramErrorSummary,
    uiModeSelect,
    signal: teardownController.signal,
  });
  const {
    scenarioDeps,
    applyGuard,
    rebuildSimulationFromParams,
    applyActive,
    applyCurrentUiParams,
    scheduleNormalModeQuickApply,
    syncBinaryUi,
    clearQuickApplyTimer,
  } = applyParams;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearQuickApplyTimer();
    teardownController.abort();
    frame.dispose();
    renderer.dispose();
    plot.dispose();
    simulation.dispose();
    if (activeAppDispose === dispose) activeAppDispose = null;
  };

  activeAppDispose = dispose;

  wireBootstrapScenarioControls({
    refs,
    state: appState,
    productModeSelect,
    uiModeSelect,
    simModeSelect,
    runtimeModeSelect,
    presetSelect,
    realSystemSelect,
    realSystemMeta,
    modeSimulationBtn,
    modeLabBtn,
    applyGuard,
    scenarioDeps,
    applyActive,
    rebuildSimulationFromParams,
    resetSimTimeAndLC: frame.resetSimTimeAndLC,
    syncBinaryUi,
    syncModeNavigation,
    writeProductHistory,
    setAppStatus,
    renderDidacticsSurface,
    requestContextChange,
    syncDebugDom,
    warnEl: warnVal,
    signal: teardownController.signal,
  });

  wireBootstrapViewControls({ refs, renderer, plot, signal: teardownController.signal });
  wireBootstrapResetHandlers({
    refs,
    state: appState,
    paramForm,
    paramErrorSummary,
    btnStart,
    btnReset,
    btnResetParams,
    applyGuard,
    scenarioDeps,
    applyCurrentUiParams,
    setParamsDirty,
    syncBinaryUi,
    setRunning: (running) => frame.setRunning(running),
    resetSimTimeAndLC: frame.resetSimTimeAndLC,
    warnEl: warnVal,
    signal: teardownController.signal,
  });
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

  wireBootstrapPersistence({
    refs,
    state: appState,
    fallbackLesson: initialView.lesson,
    applyGuard,
    scenarioDeps,
    profileController,
    currentLessonSimMode,
    setRestoringHistory: (restoring) => {
      restoringHistory = restoring;
    },
    syncModeNavigation,
    syncBinaryUi,
    renderDidacticsSurface,
    invalidate: frame.invalidate,
    applyActive,
    setAppStatus,
    writeProductHistory,
    warnEl: warnVal,
    signal: teardownController.signal,
  });

  window.addEventListener("resize", () => frame.invalidate(), { signal: teardownController.signal });
  document.getElementById("main")?.addEventListener("change", () => frame.invalidate(), listenerOptions);
  wireOcControls();

  wireParamSliders(refs, { signal: teardownController.signal });
  wireEnableHandlers(refs, { signal: teardownController.signal });
  wireNormalModeQuickControls(refs, {
    onQuickControlChange: scheduleNormalModeQuickApply,
    signal: teardownController.signal,
  });
  syncDebugDom.current = wireDebugDOM(renderer, teardownController.signal);

  await finalizeBootstrapStartup({
    refs,
    state: appState,
    warnEl: warnVal,
    initialLesson: initialView.lesson,
    corrections: parsedInitialView.corrections,
    applyActive,
    setRestoringHistory: (restoring) => {
      restoringHistory = restoring;
    },
    renderDidacticsSurface,
    syncBinaryUi,
    renderOcPanel,
    isDisposed: () => disposed,
    startFrame: frame.start,
    writeProductHistory,
    setAppStatus,
  });
}
