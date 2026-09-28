/**
 * Constructs the shared application state used across scenario flow and frame orchestration.
 * Keeps application bootstrap and frame orchestration composable.
 */
import type { BrowserScenarioDraft } from "../domain/model/types";
import { createBinaryLabState } from "../domain/education/binaryLab";
import { applyObserverModeContract } from "../presentation/shell/mode";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../application/catalog/binaryLab";
import { ensureDidacticsConfig, initDidacticsRuntime } from "../presentation/labs/didactics";
import type { FrameLoopState } from "../presentation/playback/frameLoop";
import { initNoiseState } from "../application/runtime/noise";
import { cloneParams } from "../domain/model/clone";
import type { ScenarioFlowState } from "../presentation/scenario/scenarioFlow";
import { createTransitHistoryState } from "../application/runtime/transitHistory";

export type BootstrapAppState = ScenarioFlowState & FrameLoopState;

export function createBootstrapAppState(defaultScenario: BrowserScenarioDraft): BootstrapAppState {
  const appState: BootstrapAppState = {
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
    lastValidFrame: null,
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
  return appState;
}
