/**
 * Reset and seek orchestration for the frame-loop controller.
 */
import { setText } from "../core/dom";
import type { SystemParams } from "../core/types";
import { resetInstrumentNoiseState } from "../photometry/instrumentNoise";
import type { SimulationStepV3 } from "../sim/v3";
import { resetNoiseState } from "./actions";
import type { FrameLoopContext } from "./frameLoopControllerTypes";
import {
  clearNoiseErrorLogged,
  drawStepAndReadouts,
  readCurrentPlotModes,
  recordDynamicPlotSample,
  resetDynamicPlotIfTrackingChanged,
  setRuntimeStatusWarning,
  setWarningText,
  stepOrFallback,
} from "./frameLoopControllerShared";
import { clearFixedComparisonRange, rebuildFixedPlot } from "./frameLoopFixedPlot";
import {
  displayFluxFromStep,
  pushFinitePlotSample,
  pushHistorySamples,
  resolveDisplayFlux,
  setPlotBadges,
  setPlotComparisonInset,
  setPlotMarkers,
  setPlotOverlaySeries,
  setPlotWindowOverlays,
} from "./frameLoopVisualizationHelpers";
import { formatTransitHistorySummary, resetTransitHistoryState } from "./transitHistory";
import type { AppSimulationRuntime } from "./v4Runtime";

const resetTimelineState = (ctx: FrameLoopContext): void => {
  const { refs, renderer, plot, state } = ctx;
  ctx.setRunning(false);
  clearNoiseErrorLogged();
  state.t = 0;
  state.lastStepV3 = null;
  renderer.invalidateSceneScale();
  state.lastPlottedT = Number.NaN;
  state.lastPlotMode = null;
  state.lastPlotTrackingMode = null;
  state.physicalHistory = [];
  state.measuredHistory = [];
  state.componentBaselineHistory = [];
  state.componentTransitHistory = [];
  state.componentScatterHistory = [];
  plot.clear();
  plot.setOptions({ title: state.displayFluxTitle, manualYRange: state.fixedPlotYRange });
  setPlotOverlaySeries(plot, []);
  setPlotWindowOverlays(plot, []);
  setPlotMarkers(plot, []);
  setPlotBadges(plot, []);
  setPlotComparisonInset(plot, state.comparisonInset);
  state.last = performance.now();
  state.transitHistory = resetTransitHistoryState(state.transitHistory);
  if (refs.timingHistoryVal)
    refs.timingHistoryVal.textContent = formatTransitHistorySummary(state.transitHistory);
  ctx.renderOcPanel();
};

const applyNoiseReset = (ctx: FrameLoopContext, resetNoise: boolean): void => {
  if (resetNoise) {
    ctx.state.noise = resetNoiseState(ctx.state.noise);
    return;
  }
  resetInstrumentNoiseState(ctx.state.noise.noiseState, {
    resetRng: false,
    seed: ctx.state.noise.noiseSeed,
  });
};

const sampleResetDisplayFlux = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  plotMode: string,
  step0: SimulationStepV3,
): number => {
  return resolveDisplayFlux(
    ctx.sampleFluxForPlot(simulation, params, plotMode, 0, 0, ctx.state.noise.noiseState, step0),
    displayFluxFromStep(step0, ctx.state.displayFluxScale),
    ctx.state.lastFluxForPlot,
    { preferLastFinite: false },
  );
};

const resetFixedPlot = (
  ctx: FrameLoopContext,
  args: {
    simulation: AppSimulationRuntime;
    params: SystemParams;
    plotMode: string;
    step0: SimulationStepV3;
    errorMessage: string;
  },
): void => {
  const { simulation, params, plotMode, step0, errorMessage } = args;
  try {
    rebuildFixedPlot({
      simulation,
      params,
      plotMode,
      state: ctx.state,
      plot: ctx.plot,
      renderer: ctx.renderer,
      sampleFluxForPlot: ctx.sampleFluxForPlot,
      step0,
    });
    ctx.state.lastPlottedT = Number.NaN;
    ctx.state.lastPlotMode = plotMode;
    ctx.state.lastPlotTrackingMode = "fixed";
  } catch (error) {
    if (ctx.refs.warnVal && !errorMessage) {
      ctx.refs.warnVal.textContent = error instanceof Error ? error.message : String(error);
    }
  }
};

const resetDynamicPlot = (
  ctx: FrameLoopContext,
  args: {
    simulation: AppSimulationRuntime;
    params: SystemParams;
    plotMode: string;
    trackingMode: string;
    step0: SimulationStepV3;
    fluxDisplay0: number;
    errorMessage: string;
  },
): void => {
  const { simulation, params, plotMode, trackingMode, step0, fluxDisplay0, errorMessage } = args;
  clearFixedComparisonRange(ctx.state, ctx.plot);
  pushFinitePlotSample(ctx.plot, fluxDisplay0, 0);
  pushHistorySamples(ctx.state, step0, 0, plotMode === "measured" ? fluxDisplay0 : undefined);
  ctx.state.lastPlottedT = 0;
  ctx.state.lastPlotMode = plotMode;
  ctx.state.lastPlotTrackingMode = trackingMode;
  const dynamicWarning = ctx.applyDynamicVisualizationStateSafely({
    simulation,
    params,
    step: step0,
    plotMode,
    state: ctx.state,
    plot: ctx.plot,
    renderer: ctx.renderer,
  });
  setWarningText(ctx, errorMessage || dynamicWarning || "");
};

export function resetSimTimeAndLCForContext(
  ctx: FrameLoopContext,
  opts: { resetNoise?: boolean } = {},
): void {
  const simulation = ctx.getSimulation();
  const params = ctx.getParams();
  resetTimelineState(ctx);
  applyNoiseReset(ctx, opts.resetNoise ?? true);

  const { step: step0, errorMessage } = stepOrFallback(ctx, simulation, params, 0);
  const { plotMode, trackingMode } = readCurrentPlotModes(ctx);
  const fluxDisplay0 = sampleResetDisplayFlux(ctx, simulation, params, plotMode, step0);

  if (trackingMode === "fixed") {
    resetFixedPlot(ctx, { simulation, params, plotMode, step0, errorMessage });
  } else {
    resetDynamicPlot(ctx, { simulation, params, plotMode, trackingMode, step0, fluxDisplay0, errorMessage });
  }

  setText(ctx.refs.tVal, "0.0");
  setText(ctx.refs.fluxVal, fluxDisplay0.toFixed(6));
  ctx.state.lastFluxForPlot = fluxDisplay0;
  // Treat reset as a meaningful sample so a paused lab starts with an active phase.
  ctx.onSampleStep(step0, 0);
}

const prepareSeek = (ctx: FrameLoopContext, targetSec: number, resetNoise: boolean): void => {
  ctx.setRunning(false);
  ctx.state.t = targetSec;
  ctx.state.last = performance.now();
  if (resetNoise) ctx.state.noise = resetNoiseState(ctx.state.noise);
};

const seekStepOrFallback = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
): SimulationStepV3 => {
  const attempt = stepOrFallback(ctx, simulation, params, ctx.state.t);
  if (attempt.errorMessage) {
    setWarningText(ctx, attempt.errorMessage);
  } else {
    setRuntimeStatusWarning(ctx, simulation, params);
  }
  return attempt.step;
};

const seekFixedPlot = (
  ctx: FrameLoopContext,
  args: {
    simulation: AppSimulationRuntime;
    params: SystemParams;
    plotMode: string;
    step: SimulationStepV3;
  },
): void => {
  const { simulation, params, plotMode, step } = args;
  try {
    rebuildFixedPlot({
      simulation,
      params,
      plotMode,
      state: ctx.state,
      plot: ctx.plot,
      renderer: ctx.renderer,
      sampleFluxForPlot: ctx.sampleFluxForPlot,
      step0: step,
    });
    ctx.state.lastPlottedT = Number.NaN;
    ctx.state.lastPlotMode = plotMode;
    ctx.state.lastPlotTrackingMode = "fixed";
  } catch {
    // Keep the current sample rendering below even if the preview rebuild fails.
  }
  ctx.state.lastFluxForPlot = displayFluxFromStep(step, ctx.state.displayFluxScale);
};

const seekDynamicPlot = (
  ctx: FrameLoopContext,
  args: {
    simulation: AppSimulationRuntime;
    params: SystemParams;
    plotMode: string;
    trackingMode: string;
    step: SimulationStepV3;
  },
): void => {
  const { simulation, params, plotMode, trackingMode, step } = args;
  resetDynamicPlotIfTrackingChanged(ctx, trackingMode);
  const fluxForPlot = ctx.sampleFluxForPlot(
    simulation,
    params,
    plotMode,
    ctx.state.t,
    0,
    ctx.state.noise.noiseState,
    step,
  );
  recordDynamicPlotSample(ctx, step, plotMode, trackingMode, fluxForPlot);
  ctx.applyDynamicVisualizationStateSafely({
    simulation,
    params,
    step,
    plotMode,
    state: ctx.state,
    plot: ctx.plot,
    renderer: ctx.renderer,
  });
};

export function seekToTimeForContext(
  ctx: FrameLoopContext,
  targetSec: number,
  opts: { resetNoise?: boolean } = {},
): void {
  const simulation = ctx.getSimulation();
  const params = ctx.getParams();
  const { plotMode, trackingMode } = readCurrentPlotModes(ctx);
  prepareSeek(ctx, targetSec, opts.resetNoise ?? false);

  const step = seekStepOrFallback(ctx, simulation, params);
  if (trackingMode === "fixed") {
    seekFixedPlot(ctx, { simulation, params, plotMode, step });
  } else {
    seekDynamicPlot(ctx, { simulation, params, plotMode, trackingMode, step });
  }

  drawStepAndReadouts(ctx, params, step, plotMode, ctx.state.lastFluxForPlot);
  ctx.onSampleStep(step, ctx.state.t);
}
