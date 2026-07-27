/**
 * Shared helpers for frame-loop reset, seek, and live frame orchestration.
 */
import { setText } from "../core/dom";
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import { readPlotMode, readPlotTrackingMode } from "../ui/inputs";
import type { FrameLoopContext, PlotModes, StepAttempt } from "./frameLoopControllerTypes";
import { fallbackStepV3 } from "./frameLoopFallback";
import { clearFixedComparisonRange } from "./frameLoopFixedPlot";
import {
  displayFluxFromStep,
  pushFinitePlotSample,
  pushHistorySamples,
  resolveDisplayFlux,
} from "./frameLoopVisualizationHelpers";
import type { AppSimulationRuntime } from "./v4Runtime";
import { updateAccessibleVisualizationSummary } from "./frameLoopAccessibility";

let noiseErrorLogged = false;

export function clearNoiseErrorLogged(): void {
  noiseErrorLogged = false;
}

export function warnNoisePipelineOnce(noiseErr: unknown): void {
  if (noiseErrorLogged) return;
  noiseErrorLogged = true;
  console.warn("[frameLoop] noise pipeline error, falling back to physical flux:", noiseErr);
}

export const setWarningText = (ctx: FrameLoopContext, message: string): void => {
  if (ctx.refs.warnVal) ctx.refs.warnVal.textContent = message;
};

export const readCurrentPlotModes = (ctx: FrameLoopContext): PlotModes => {
  return {
    plotMode: readPlotMode(ctx.refs.plotMode),
    trackingMode: readPlotTrackingMode(ctx.refs.plotTrackingMode),
  };
};

export const stepOrFallback = (
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

export const setRuntimeStatusWarning = (
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

export const recordDynamicPlotSample = (
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

const updateVisibilityReadout = (element: HTMLElement | null | undefined, value: unknown): void => {
  if (!element) return;
  element.textContent = typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "";
};

export const drawStepAndReadouts = (
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

export const resetDynamicPlotIfTrackingChanged = (ctx: FrameLoopContext, trackingMode: string): void => {
  clearFixedComparisonRange(ctx.state, ctx.plot);
  if (trackingMode === ctx.state.lastPlotTrackingMode) return;
  ctx.plot.clear();
  ctx.state.lastPlottedT = Number.NaN;
  ctx.state.lastPlotMode = null;
};
