import { setText } from "../core/dom";
import type { SystemParams } from "../core/types";
import { applyInstrumentNoiseAndSystematics, resetInstrumentNoiseState } from "../photometry/instrumentNoise";
import { smearedFluxAt } from "../photometry/smearing";
import type { SimulationStepV3 } from "../sim/v3";
import { readClampSmearedFlux, readPlotMode, readPlotTrackingMode } from "../ui/inputs";
import { computeFrameDt, readTimeSpeed, resetNoiseState } from "./actions";
import { scaleFluxForDisplay } from "./displayFlux";
import type { FrameLoopDeps } from "./frameLoop";
import { fallbackStepV3 } from "./frameLoopFallback";
import type { applyDynamicVisualizationState } from "./frameLoopVisualization";
import {
  clearFixedComparisonRange,
  displayFluxFromStep,
  pushFinitePlotSample,
  pushHistorySamples,
  rebuildFixedPlot,
  resolveDisplayFlux,
  setPlotBadges,
  setPlotComparisonInset,
  setPlotMarkers,
  setPlotOverlaySeries,
  setPlotWindowOverlays,
} from "./frameLoopVisualization";
import { getInstrumentCfgFromPhotometry, type NoiseState } from "./noise";
import { formatTransitHistorySummary, resetTransitHistoryState } from "./transitHistory";
import type { AppSimulationRuntime } from "./v4Runtime";
import {
  buildVisualizationAccessibleSnapshot,
  formatLightCurveAccessibleSummary,
} from "../ui/visualizationAccessible";

let noiseErrorLogged = false;

export type FrameLoopControllerApi = {
  frame: (now: number) => void;
  start: () => void;
  dispose: () => void;
  setRunning: (next: boolean) => void;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  seekToTime: (targetSec: number, opts?: { resetNoise?: boolean }) => void;
  invalidate: () => void;
};

export type SampleFluxForPlot = (
  simulation: AppSimulationRuntime,
  params: SystemParams,
  plotMode: string,
  tSec: number,
  dtSec: number,
  noiseState?: NoiseState["noiseState"],
  stepAtTime?: SimulationStepV3,
) => number;

export type FrameLoopContext = FrameLoopDeps & {
  applyDynamicVisualizationStateSafely: (
    args: Parameters<typeof applyDynamicVisualizationState>[0],
  ) => string | undefined;
  queueNextFrame: () => void;
  sampleFluxForPlot: SampleFluxForPlot;
  setRunning: (next: boolean) => void;
};

type PlotModes = {
  plotMode: string;
  trackingMode: string;
};

type StepAttempt = {
  step: SimulationStepV3;
  errorMessage: string;
};

type FrameSampleResult = {
  fluxForPlot: number;
  shouldSample: boolean;
};

const setWarningText = (ctx: FrameLoopContext, message: string): void => {
  if (ctx.refs.warnVal) ctx.refs.warnVal.textContent = message;
};

const readCurrentPlotModes = (ctx: FrameLoopContext): PlotModes => {
  return {
    plotMode: readPlotMode(ctx.refs.plotMode),
    trackingMode: readPlotTrackingMode(ctx.refs.plotTrackingMode),
  };
};

const sampleStepForPlot = (
  simulation: AppSimulationRuntime,
  tSec: number,
  stepAtTime?: SimulationStepV3,
): SimulationStepV3 => {
  return stepAtTime && stepAtTime.tObsSec === tSec ? stepAtTime : simulation.step(tSec);
};

const photometryCadenceSec = (params: SystemParams): number | undefined => {
  return params.star.photometry === undefined ? undefined : params.star.photometry.cadenceSec;
};

const photometrySubsampleCount = (params: SystemParams): number | undefined => {
  return params.star.photometry === undefined ? undefined : params.star.photometry.nSubsamples;
};

const shouldSmearMeasuredFlux = (
  cadenceSec: number | undefined,
  nSubsamples: number | undefined,
): boolean => {
  return (cadenceSec ?? 0) > 0 && (nSubsamples ?? 1) > 1;
};

const simulationFluxSampler = (simulation: AppSimulationRuntime): ((tSec: number) => number) => {
  return (sampleTimeSec) => simulation.step(sampleTimeSec).flux.total;
};

const smearedMeasuredFlux = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  tSec: number,
  fluxPhysical: number,
): number => {
  const cadenceSec = photometryCadenceSec(params);
  const nSubsamples = photometrySubsampleCount(params);
  if (!shouldSmearMeasuredFlux(cadenceSec, nSubsamples)) return fluxPhysical;

  return smearedFluxAt(simulationFluxSampler(simulation), tSec, {
    cadenceSec,
    nSubsamples,
    clamp01: readClampSmearedFlux(ctx.refs.clampSmearedFlux),
    maxSubsamples: 512,
  });
};

const measuredFluxForPlot = (args: {
  ctx: FrameLoopContext;
  simulation: AppSimulationRuntime;
  params: SystemParams;
  tSec: number;
  dtSec: number;
  noiseState: NoiseState["noiseState"];
  fluxPhysical: number;
}): number => {
  const { ctx, simulation, params, tSec, dtSec, noiseState, fluxPhysical } = args;
  const ph = params.star.photometry;
  return applyInstrumentNoiseAndSystematics({
    flux: smearedMeasuredFlux(ctx, simulation, params, tSec, fluxPhysical),
    tSec,
    dtSec,
    cfg: getInstrumentCfgFromPhotometry(ph),
    state: noiseState,
  });
};

const directDisplayFlux = (step: SimulationStepV3, plotMode: string): number | undefined => {
  if (plotMode === "measured") return undefined;
  const displayFlux = step.debug?.displayFluxValue;
  return displayFlux !== undefined && Number.isFinite(displayFlux) ? displayFlux : undefined;
};

export function sampleFluxForPlotForContext(
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  plotMode: string,
  tSec: number,
  dtSec: number,
  noiseState = ctx.state.noise.noiseState,
  stepAtTime?: SimulationStepV3,
): number {
  const sampledStep = sampleStepForPlot(simulation, tSec, stepAtTime);
  const displayFlux = directDisplayFlux(sampledStep, plotMode);
  if (displayFlux !== undefined) return displayFlux;

  const fluxPhysical = sampledStep.flux.total;
  const fluxForPlot =
    plotMode === "measured"
      ? measuredFluxForPlot({ ctx, simulation, params, tSec, dtSec, noiseState, fluxPhysical })
      : fluxPhysical;
  return scaleFluxForDisplay(fluxForPlot, ctx.state.displayFluxScale);
}

const resetTimelineState = (ctx: FrameLoopContext): void => {
  const { refs, renderer, plot, state } = ctx;
  ctx.setRunning(false);
  noiseErrorLogged = false;
  state.t = 0;
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

const stepOrFallback = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  tSec: number,
): StepAttempt => {
  try {
    const step = simulation.step(tSec);
    ctx.state.lastStepV3 = step;
    return { step, errorMessage: "" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const step = fallbackStepV3(tSec, params, ctx.state.lastStepV3 ?? undefined);
    return { step, errorMessage };
  }
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

const setRuntimeStatusWarning = (
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  requireStatusMessage = false,
): void => {
  const runtimeStatus = requireStatusMessage
    ? simulation.takeStatusMessage()
    : simulation.takeStatusMessage?.();
  setWarningText(ctx, runtimeStatus ?? ctx.uiWarningText(params) ?? "");
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

const resetDynamicPlotIfTrackingChanged = (ctx: FrameLoopContext, trackingMode: string): void => {
  clearFixedComparisonRange(ctx.state, ctx.plot);
  if (trackingMode === ctx.state.lastPlotTrackingMode) return;
  ctx.plot.clear();
  ctx.state.lastPlottedT = Number.NaN;
  ctx.state.lastPlotMode = null;
};

const recordDynamicPlotSample = (
  ctx: FrameLoopContext,
  step: SimulationStepV3,
  plotMode: string,
  trackingMode: string,
  fluxForPlot: number,
): void => {
  pushFinitePlotSample(ctx.plot, fluxForPlot, ctx.state.t);
  pushHistorySamples(ctx.state, step, ctx.state.t, plotMode === "measured" ? fluxForPlot : undefined);
  ctx.state.lastPlottedT = ctx.state.t;
  ctx.state.lastPlotMode = plotMode;
  ctx.state.lastPlotTrackingMode = trackingMode;
  ctx.state.lastFluxForPlot = resolveDisplayFlux(
    fluxForPlot,
    displayFluxFromStep(step, ctx.state.displayFluxScale),
    ctx.state.lastFluxForPlot,
  );
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

const updateVisibilityReadout = (element: HTMLElement | null | undefined, value: unknown): void => {
  if (!element) return;
  element.textContent = typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "";
};

const accessibleSummaryKeys = new WeakMap<HTMLElement, string>();

const updateAccessibleVisualizationSummary = (
  ctx: FrameLoopContext,
  params: SystemParams,
  step: SimulationStepV3,
  plotMode: string,
): void => {
  if (typeof document === "undefined") return;
  const skySummary = document.getElementById("skySummary");
  const lcSummary = document.getElementById("lcSummary");
  if (!skySummary && !lcSummary) return;
  const key = [
    Math.floor(ctx.state.t / 30),
    step.debug?.nOcculters ?? 0,
    plotMode,
    params.star.r,
    params.planet.r,
    params.moon?.r ?? "none",
    ctx.refs.warnVal?.textContent ?? "",
  ].join(":");
  if (
    (!skySummary || accessibleSummaryKeys.get(skySummary) === key) &&
    (!lcSummary || accessibleSummaryKeys.get(lcSummary) === key)
  ) {
    return;
  }
  const snapshot = buildVisualizationAccessibleSnapshot({
    params,
    step,
    timeSec: ctx.state.t,
    plotMode,
    plot: ctx.plot.getAccessibleSnapshot(),
    warning: ctx.refs.warnVal?.textContent ?? undefined,
  });
  if (skySummary && accessibleSummaryKeys.get(skySummary) !== key) {
    skySummary.textContent = snapshot.sceneGeometry;
    accessibleSummaryKeys.set(skySummary, key);
  }
  if (lcSummary && accessibleSummaryKeys.get(lcSummary) !== key) {
    lcSummary.textContent = formatLightCurveAccessibleSummary(snapshot);
    accessibleSummaryKeys.set(lcSummary, key);
  }
};

const drawStepAndReadouts = (
  ctx: FrameLoopContext,
  params: SystemParams,
  step: SimulationStepV3,
  plotMode: string,
  fluxCandidate: number,
): void => {
  if (!ctx.isBinaryModeActive() || ctx.getBinaryLabState().skyVisible) {
    ctx.renderer.drawFrameV3(params, step, ctx.state.t);
  }
  ctx.plot.setOptions({ title: ctx.state.displayFluxTitle });
  ctx.plot.draw();
  setText(ctx.refs.tVal, ctx.state.t.toFixed(1));
  const fluxForDisplay = resolveDisplayFlux(
    fluxCandidate,
    displayFluxFromStep(step, ctx.state.displayFluxScale),
    ctx.state.lastFluxForPlot,
  );
  setText(ctx.refs.fluxVal, fluxForDisplay.toFixed(6));
  if (ctx.refs.plotModeVal) ctx.refs.plotModeVal.textContent = plotMode;
  if (ctx.refs.nOccultersVal) ctx.refs.nOccultersVal.textContent = String(step.debug?.nOcculters ?? "");
  updateVisibilityReadout(ctx.refs.vPlanetVal, step.renderSignals.visibilityFractions.planet);
  updateVisibilityReadout(ctx.refs.vMoonVal, step.renderSignals.visibilityFractions.moon);
  updateAccessibleVisualizationSummary(ctx, params, step, plotMode);
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

  if (ctx.state.running) ctx.state.t -= dtSim;
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
    if (!noiseErrorLogged) {
      noiseErrorLogged = true;
      console.warn("[frameLoop] noise pipeline error, falling back to physical flux:", noiseErr);
    }
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
