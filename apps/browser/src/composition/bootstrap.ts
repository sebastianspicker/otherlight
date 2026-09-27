/** Composes one app instance and owns abortable cleanup across reinitialization. */
import { ChromaticWorkerAdapter } from "../infrastructure/workers/chromaticWorkerAdapter";
import { Canvas2DRenderer } from "../presentation/render/sky/canvas2d";
import { LightCurvePlot } from "../presentation/render/lightCurve/lightCurvePlot";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../application/catalog/binaryLab";
import { getPresetById } from "../application/catalog/presets";
import { wireObservatory } from "../presentation/observatory/observatory";
import { wireDebugDOM } from "../presentation/shell/debug";
import {
  createSimulationRuntimeV4FromParams,
  type AppSimulationRuntime,
} from "../application/runtime/v4Runtime";
import { cloneParams } from "../domain/model/clone";
import { uiWarningText } from "../application/runtime/warnings";
import {
  formatTransitHistorySummary,
  updateTransitHistoryFromStep,
} from "../application/runtime/transitHistory";
import { onDidacticSignals, renderLabDidacticsSurface } from "../presentation/labs/didactics";
import { computeDidacticSignals } from "../domain/education";
import { createUiRefs } from "../presentation/shell/refs";
import { clearParamValidationUi } from "../presentation/scenario/paramValidation";
import { wireEnableHandlers } from "../presentation/scenario/enable";
import { wireNormalModeQuickControls } from "../presentation/scenario/quickControls";
import { syncScenarioSource, wireScenarioSource } from "../presentation/scenario/scenarioSource";
import { wireParamSliders } from "../presentation/scenario/sliders";
import { isBinaryModeActive, isLabProductModeActive } from "../presentation/scenario/scenarioFlow";
import { createFrameLoopController } from "../presentation/playback/frameLoop";
import { wireDidacticsUi } from "../presentation/labs/didacticsWiring";
import { wireBootstrapViewControls } from "../presentation/playback/viewControls";
import { createBootstrapOcPanelController } from "../presentation/timing/ocPanel";
import { createBootstrapDirtyGuard } from "../presentation/scenario/dirtyGuard";
import { wireBootstrapLightCurveActions } from "../presentation/playback/lightCurveActions";
import {
  initializeProductViewControls,
  readProductViewStateFromControls,
  syncProductModeNavigation,
} from "../presentation/shell/productNavigation";
import { wireBootstrapProfile } from "../presentation/shell/profileSwitch";
import { createProductHistoryWriter } from "../presentation/workspace/productHistory";
import { createBootstrapStatusWriter } from "../presentation/shell/status";
import {
  readBootstrapRuntimeMode,
  runtimeArgsFromBootstrapState,
  syncBootstrapDisplayFlux,
} from "../application/runtime/runtimeArgs";
import { wireBootstrapPersistence } from "../presentation/workspace/persistence";
import { createBootstrapAppState } from "./appState";
import { createBootstrapApplyParams } from "../presentation/scenario/applyParams";
import { wireBootstrapScenarioControls } from "../presentation/scenario/scenarioControls";
import { wireBootstrapResetHandlers } from "../presentation/scenario/resetHandlers";
import { finalizeBootstrapStartup } from "./startup";
import { currentDidacticSignals } from "../application/runtime/didacticSignals";

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
  const {
    appStatus,
    appStatusMessage,
    appRetryBtn,
    paramForm,
    paramErrorSummary,
    paramDirtyState,
    dirtyChangeDialog: dirtyDialog,
    dirtyKeepEditingBtn,
    dirtyDiscardBtn,
    modeSimulationBtn,
    modeLabBtn,
    lcExportBtn,
    btnUndoClearLC,
  } = refs;
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

  const observatoryRef: { current?: ReturnType<typeof wireObservatory> } = {};
  const renderDidacticsSurface = () => {
    renderLabDidacticsSurface(
      refs,
      appState.didacticsRuntime,
      isLabProductModeActive(refs) || Boolean(observatoryRef.current?.isLearningVisible()),
    );
    observatoryRef.current?.sync();
  };

  const acceptCurrentDidacticFrame = (step: Parameters<typeof currentDidacticSignals>[1]): void => {
    appState.didacticsRuntime = onDidacticSignals(
      appState.params,
      appState.didacticsRuntime,
      currentDidacticSignals(appState.params, step),
      step.timing,
      step.tObsSec,
    );
  };

  const refreshDidacticSignals = (): void => {
    acceptCurrentDidacticFrame(appState.lastValidFrame ?? simulation.step(appState.t));
  };

  const frame = createFrameLoopController({
    chromaticSampler: new ChromaticWorkerAdapter(
      () => new Worker(new URL("./chromatic.worker.ts", import.meta.url), { type: "module" }),
    ),
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
      if (isLabProductModeActive(refs) || observatoryRef.current?.isLearningVisible()) {
        acceptCurrentDidacticFrame(step);
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

  const syncModeNavigation = (): void => {
    syncProductModeNavigation(productModeSelect, modeSimulationBtn, modeLabBtn);
    syncScenarioSource();
  };

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
  wireScenarioSource(teardownController.signal);

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
    invalidate: frame.invalidate,
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
  const observatory = wireObservatory({
    refs,
    state: appState,
    seekToTime: frame.seekToTime,
    setRunning: frame.setRunning,
    invalidate: frame.invalidate,
    refitScene: () => renderer.invalidateSceneScale(),
    refreshDidacticSignals,
    signal: teardownController.signal,
  });
  observatoryRef.current = observatory;
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
