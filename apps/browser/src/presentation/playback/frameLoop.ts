/**
 * Creates the animation frame loop controller.
 */
import { ChromaticOverlay } from "./chromaticOverlay";
import type { UiRefs } from "../shell/refs";
import { setRunningState } from "./actions";
import { frameForContext } from "./frameLoopFrame";
import { resetSimTimeAndLCForContext, seekToTimeForContext } from "./frameLoopResetSeek";
import { sampleFluxForPlotForContext } from "./frameLoopSampleFlux";
import type {
  FrameLoopContext,
  FrameLoopControllerApi,
  FrameLoopDeps,
  SampleFluxForPlot,
} from "./frameLoopControllerTypes";
import { applyDynamicVisualizationState } from "./frameLoopDynamicVisualization";
import { initializeVisualizationState } from "./frameLoopVisualizationHelpers";

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
  const overlayWarning = typeof document === "undefined" ? undefined : document.createElement("span");
  if (overlayWarning) {
    overlayWarning.setAttribute("role", "status");
    overlayWarning.id = "chromaticOverlayWarning";
    refs.warnVal?.after(overlayWarning);
  }
  if (deps.chromaticSampler)
    state.chromaticOverlay = new ChromaticOverlay(deps.chromaticSampler, deps.plot, (message) => {
      if (overlayWarning) overlayWarning.textContent = message;
    });
  if (typeof document !== "undefined" && document.hidden) state.chromaticOverlay?.suspend(true);
  function configureOverlay(): void {
    state.chromaticOverlay?.configure(deps.getSimulation(), deps.getParams());
  }

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
    state.chromaticOverlay?.dispose();
    overlayWarning?.remove();
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
    configureOverlay();
    resetSimTimeAndLCForContext(ctx, opts);
  }

  function seekToTime(targetSec: number, opts: { resetNoise?: boolean } = {}): void {
    configureOverlay();
    seekToTimeForContext(ctx, targetSec, opts);
  }

  function frame(now: number): void {
    if (disposed) return;
    rafId = null;
    configureOverlay();
    frameForContext(ctx, now);
  }

  const onVisibilityChange = (): void => {
    state.chromaticOverlay?.suspend(document.hidden);
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
