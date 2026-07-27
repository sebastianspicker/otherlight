/**
 * Live animation-frame orchestration for the frame-loop controller.
 */
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import { computeFrameDt, readTimeSpeed } from "./actions";
import type { FrameLoopContext, FrameSampleResult, PlotModes } from "./frameLoopControllerTypes";
import {
  drawStepAndReadouts,
  readCurrentPlotModes,
  recordDynamicPlotSample,
  setRuntimeStatusWarning,
  setWarningText,
  stepOrFallback,
  warnNoisePipelineOnce,
} from "./frameLoopControllerShared";
import { clearFixedComparisonRange, rebuildFixedPlot } from "./frameLoopFixedPlot";
import {
  displayFluxFromStep,
  pushFinitePlotSample,
  pushHistorySamples,
} from "./frameLoopVisualizationHelpers";
import type { AppSimulationRuntime } from "./v4Runtime";

const advanceFrameTime = (ctx: FrameLoopContext, now: number): number => {
  const dtReal = computeFrameDt(now, ctx.state.last);
  ctx.state.last = now;
  const speed = readTimeSpeed(ctx.refs.timeSpeed, ctx.refs.timeSpeedVal, ctx.refs.timeSpeedMultiplier);
  const dtSim = ctx.state.running ? dtReal * speed : 0;
  if (ctx.state.running) ctx.state.t += dtSim;
  return dtSim;
};

const frameStepOrFallback = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  dtSim: number,
): SimulationStepV3 => {
  const attempt = stepOrFallback(ctx, simulation, params, ctx.state.t);
  if (!attempt.errorMessage) {
    setRuntimeStatusWarning(ctx, simulation, params, true);
    return attempt.step;
  }

  if (ctx.state.running) {
    ctx.state.t -= dtSim;
    attempt.step.tObsSec = ctx.state.t;
  }
  ctx.setRunning(false);
  setWarningText(ctx, attempt.errorMessage);
  return attempt.step;
};

const resetFramePlotIfTrackingChanged = (ctx: FrameLoopContext, modes: PlotModes): void => {
  if (modes.trackingMode === ctx.state.lastPlotTrackingMode || modes.trackingMode === "fixed") return;
  clearFixedComparisonRange(ctx.state, ctx.plot);
  ctx.plot.clear();
  ctx.state.lastPlottedT = Number.NaN;
  ctx.state.lastPlotMode = null;
};

const shouldRebuildFixedFramePlot = (ctx: FrameLoopContext, modes: PlotModes): boolean => {
  return (
    modes.trackingMode === "fixed" &&
    (ctx.state.lastPlotTrackingMode !== "fixed" ||
      modes.plotMode !== ctx.state.lastPlotMode ||
      !Number.isFinite(ctx.state.lastPlottedT))
  );
};

const rebuildFixedFramePlot = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  plotMode: string,
): void => {
  try {
    rebuildFixedPlot({
      simulation,
      params,
      plotMode,
      state: ctx.state,
      plot: ctx.plot,
      renderer: ctx.renderer,
      sampleFluxForPlot: ctx.sampleFluxForPlot,
    });
    ctx.state.lastPlottedT = Number.NaN;
    ctx.state.lastPlotMode = plotMode;
    ctx.state.lastPlotTrackingMode = "fixed";
  } catch {
    // Ignore preview rebuild errors here; the live frame state below still updates the readouts.
  }
};

const shouldSampleFrame = (ctx: FrameLoopContext, modes: PlotModes): boolean => {
  return (
    modes.trackingMode !== "fixed" &&
    (!Number.isFinite(ctx.state.lastPlottedT) ||
      ctx.state.t !== ctx.state.lastPlottedT ||
      modes.plotMode !== ctx.state.lastPlotMode)
  );
};

const sampleFramePlot = (
  ctx: FrameLoopContext,
  args: {
    simulation: AppSimulationRuntime;
    params: SystemParams;
    modes: PlotModes;
    step: SimulationStepV3;
    dtSim: number;
  },
): FrameSampleResult => {
  const { simulation, params, modes, step, dtSim } = args;
  const shouldSample = shouldSampleFrame(ctx, modes);
  if (!shouldSample) return { fluxForPlot: ctx.state.lastFluxForPlot, shouldSample };

  try {
    const fluxForPlot = ctx.sampleFluxForPlot(
      simulation,
      params,
      modes.plotMode,
      ctx.state.t,
      dtSim,
      ctx.state.noise.noiseState,
      step,
    );
    recordDynamicPlotSample(ctx, step, modes.plotMode, modes.trackingMode, fluxForPlot);
    return { fluxForPlot, shouldSample };
  } catch (noiseErr) {
    warnNoisePipelineOnce(noiseErr);
    const fluxForPlot = displayFluxFromStep(step, ctx.state.displayFluxScale);
    pushFinitePlotSample(ctx.plot, fluxForPlot, ctx.state.t);
    pushHistorySamples(ctx.state, step, ctx.state.t, undefined);
    ctx.state.lastPlottedT = ctx.state.t;
    ctx.state.lastPlotMode = modes.plotMode;
    ctx.state.lastPlotTrackingMode = modes.trackingMode;
    ctx.state.lastFluxForPlot = fluxForPlot;
    return { fluxForPlot, shouldSample };
  }
};

const applyDynamicVisualizationForFrame = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  modes: PlotModes,
  step: SimulationStepV3,
): void => {
  if (modes.trackingMode === "fixed") return;
  ctx.applyDynamicVisualizationStateSafely({
    simulation,
    params,
    step,
    plotMode: modes.plotMode,
    state: ctx.state,
    plot: ctx.plot,
    renderer: ctx.renderer,
  });
};

export function frameForContext(ctx: FrameLoopContext, now: number): void {
  const simulation = ctx.getSimulation();
  const params = ctx.getParams();
  const dtSim = advanceFrameTime(ctx, now);
  const modes = readCurrentPlotModes(ctx);
  const step = frameStepOrFallback(ctx, simulation, params, dtSim);

  resetFramePlotIfTrackingChanged(ctx, modes);
  if (shouldRebuildFixedFramePlot(ctx, modes)) {
    rebuildFixedFramePlot(ctx, simulation, params, modes.plotMode);
  }

  const sample = sampleFramePlot(ctx, { simulation, params, modes, step, dtSim });
  applyDynamicVisualizationForFrame(ctx, simulation, params, modes, step);
  drawStepAndReadouts(ctx, params, step, modes.plotMode, sample.fluxForPlot);
  if (sample.shouldSample) ctx.onSampleStep(step, ctx.state.t);
  ctx.queueNextFrame();
}
