import type { BinaryLabState } from "../didactics/binaryLab";
import type { SystemParams } from "../core/types";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
} from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";
import type { SimulationStepV3 } from "../sim/v3";
import type { UiRefs } from "../ui/refs";
import { setRunningState } from "./actions";
import {
  type FrameLoopContext,
  type FrameLoopControllerApi,
  type SampleFluxForPlot,
  frameForContext,
  resetSimTimeAndLCForContext,
  sampleFluxForPlotForContext,
  seekToTimeForContext,
} from "./frameLoopControllerLogic";
import { applyDynamicVisualizationState, initializeVisualizationState } from "./frameLoopVisualization";
import type { NoiseState } from "./noise";
import type { TransitHistoryState } from "./transitHistory";
import type { AppSimulationRuntime } from "./v4Runtime";

let visualizationErrorLogged = false;

export type FrameLoopState = {
  running: boolean;
  t: number;
  last: number;
  lastPlottedT: number;
  lastPlotMode: string | null;
  lastPlotTrackingMode: string | null;
  lastFluxForPlot: number;
  lastStepV3: SimulationStepV3 | null;
  displayFluxScale: number;
  displayFluxTitle: string;
  fixedPlotYRange?: { lo: number; hi: number };
  fixedPlotYRangeMode?: string | null;
  noise: NoiseState;
  transitHistory: TransitHistoryState;
  physicalHistory: LightCurveOverlayPoint[];
  measuredHistory: LightCurveOverlayPoint[];
  componentBaselineHistory: LightCurveOverlayPoint[];
  componentTransitHistory: LightCurveOverlayPoint[];
  componentScatterHistory: LightCurveOverlayPoint[];
  comparisonCurveSeries?: LightCurveOverlaySeries[];
  comparisonInset?: LightCurveComparisonInset;
  comparisonGhosts?: SceneGhostGeometry[];
  comparisonBadges?: LightCurveBadge[];
};

export type FrameLoopDeps = {
  refs: UiRefs;
  renderer: Canvas2DRenderer;
  plot: LightCurvePlot;
  state: FrameLoopState;
  getSimulation: () => AppSimulationRuntime;
  getParams: () => SystemParams;
  getBinaryLabState: () => BinaryLabState;
  isBinaryModeActive: () => boolean;
  uiWarningText: (p: SystemParams) => string | undefined;
  onSampleStep: (step: SimulationStepV3, tSec: number) => void;
  renderOcPanel: () => void;
};

export function createFrameLoopController(deps: FrameLoopDeps): FrameLoopControllerApi {
  const { refs, state } = deps;
  let disposed = false;
  let rafId: number | null = null;

  initializeVisualizationState(state);

  function applyDynamicVisualizationStateSafely(
    args: Parameters<typeof applyDynamicVisualizationState>[0],
  ): string | undefined {
    try {
      applyDynamicVisualizationState(args);
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!visualizationErrorLogged) {
        visualizationErrorLogged = true;
        console.warn("[frameLoop] dynamic visualization error, continuing primary frame:", error);
      }
      const warning = `Visualization overlay failed: ${message}`;
      if (refs.warnVal) refs.warnVal.textContent = warning;
      return warning;
    }
  }

  function requestFrame(): void {
    if (disposed || rafId !== null || (typeof document !== "undefined" && document.hidden)) return;
    rafId = requestAnimationFrame(frame);
  }

  function queueNextFrame(): void {
    if (!state.running) return;
    requestFrame();
  }

  function invalidate(): void {
    requestFrame();
  }

  function dispose(): void {
    disposed = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function start(): void {
    invalidate();
  }

  function setRunning(next: boolean): void {
    const uiState = setRunningState(next, refs.btnStart);
    state.running = uiState.running;
    state.last = uiState.last;
    if (state.running) {
      requestFrame();
    } else if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  const sampleFluxForPlot: SampleFluxForPlot = (
    simulation,
    params,
    plotMode,
    tSec,
    dtSec,
    noiseState = state.noise.noiseState,
    stepAtTime,
  ) => sampleFluxForPlotForContext(ctx, simulation, params, plotMode, tSec, dtSec, noiseState, stepAtTime);

  function resetSimTimeAndLC(opts: { resetNoise?: boolean } = {}): void {
    resetSimTimeAndLCForContext(ctx, opts);
  }

  function seekToTime(targetSec: number, opts: { resetNoise?: boolean } = {}): void {
    seekToTimeForContext(ctx, targetSec, opts);
  }

  function frame(now: number): void {
    if (disposed) return;
    rafId = null;
    frameForContext(ctx, now);
  }

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      return;
    }
    state.last = performance.now();
    invalidate();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

  const ctx: FrameLoopContext = {
    ...deps,
    applyDynamicVisualizationStateSafely,
    queueNextFrame,
    sampleFluxForPlot,
    setRunning,
  };

  const disposeWithVisibility = dispose;
  function disposeController(): void {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    disposeWithVisibility();
  }

  return { frame, start, dispose: disposeController, setRunning, resetSimTimeAndLC, seekToTime, invalidate };
}
