/**
 * Live animation-frame orchestration for the frame-loop controller.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { SimulationFrame } from "../../domain/simulation/frames";
import { computeFrameDt, readTimeSpeed } from "./actions";
import type { FrameLoopContext, FrameSampleResult, PlotModes } from "./frameLoopControllerTypes";
import {
  drawStepAndReadouts,
  readCurrentPlotModes,
  recordDynamicPlotSample,
  setRuntimeStatusWarning,
  setWarningText,
  trySimulationStep,
  warnNoisePipelineOnce,
} from "./frameLoopControllerShared";
import { clearFixedComparisonRange, rebuildFixedPlot } from "./frameLoopFixedPlot";
import {
  displayFluxFromStep,
  pushFinitePlotSample,
  pushHistorySamples,
} from "./frameLoopVisualizationHelpers";
import type { AppSimulationRuntime } from "../../application/v4Runtime";

const advanceFrameTime = (ctx: FrameLoopContext, now: number): number => {
  const dtReal = computeFrameDt(now, ctx.state.last);
  ctx.state.last = now;
  const speed = readTimeSpeed(ctx.refs.timeSpeed, ctx.refs.timeSpeedVal, ctx.refs.timeSpeedMultiplier);
  const dtSim = ctx.state.running ? dtReal * speed : 0;
  if (ctx.state.running) ctx.state.t += dtSim;
  return dtSim;
};

const frameStep = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: BrowserScenarioDraft,
  dtSim: number,
): SimulationFrame | undefined => {
  const attempt = trySimulationStep(ctx, simulation, ctx.state.t);
  if (attempt.ok) {
    setRuntimeStatusWarning(ctx, simulation, params, true);
    return attempt.step;
  }

  if (ctx.state.running) {
    ctx.state.t -= dtSim;
  }
  ctx.setRunning(false);
  setWarningText(ctx, `Simulation unavailable: ${attempt.errorMessage}`);
  return undefined;
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
  params: BrowserScenarioDraft,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setWarningText(ctx, `Fixed preview unavailable: ${message}`);
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
    params: BrowserScenarioDraft;
    modes: PlotModes;
    step: SimulationFrame;
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
  params: BrowserScenarioDraft,
  modes: PlotModes,
  step: SimulationFrame,
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
  const step = frameStep(ctx, simulation, params, dtSim);

  if (!step) {
    const lastValidFrame = ctx.state.lastValidFrame;
    if (lastValidFrame) {
      drawStepAndReadouts(ctx, params, lastValidFrame, modes.plotMode, ctx.state.lastFluxForPlot);
    }
    ctx.queueNextFrame();
    return;
  }

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
