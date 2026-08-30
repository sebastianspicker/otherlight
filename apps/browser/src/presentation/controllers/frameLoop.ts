/**
 * Owns frame Loop support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { UiRefs } from "../ui/refs";
import { setRunningState } from "./actions";
import {
  type SampleFluxForPlot,
  frameForContext,
  resetSimTimeAndLCForContext,
  sampleFluxForPlotForContext,
  seekToTimeForContext,
} from "./frameLoopControllerLogic";
import type { FrameLoopContext, FrameLoopControllerApi, FrameLoopDeps } from "./frameLoopControllerTypes";
import { applyDynamicVisualizationState, initializeVisualizationState } from "./frameLoopVisualization";

export type { FrameLoopDeps, FrameLoopState } from "./frameLoopControllerTypes";

let visualizationErrorLogged = false;

function reportDynamicVisualizationError(refs: UiRefs, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!visualizationErrorLogged) {
    visualizationErrorLogged = true;
    console.warn("[frameLoop] dynamic visualization error, continuing primary frame:", error);
  }
  const warning = `Visualization overlay failed: ${message}`;
  if (refs.warnVal) refs.warnVal.textContent = warning;
  return warning;
}

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
      return reportDynamicVisualizationError(refs, error);
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
