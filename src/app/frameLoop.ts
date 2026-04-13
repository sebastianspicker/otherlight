import { setText } from "../core/dom";
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import type { BinaryLabState } from "../didactics/binaryLab";
import { scaleFluxForDisplay } from "./displayFlux";
import {
  applyInstrumentNoiseAndSystematics,
  resetInstrumentNoiseState,
} from "../photometry/instrumentNoise";
import { smearedFluxAt } from "../photometry/smearing";
import { renderScene } from "../render/scene";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
} from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";
import { readClampSmearedFlux, readPlotMode, readPlotTrackingMode } from "../ui/inputs";
import type { UiRefs } from "../ui/refs";
import { computeFrameDt, readTimeSpeed, resetNoiseState, setRunningState } from "./actions";
import { getInstrumentCfgFromPhotometry, type NoiseState } from "./noise";
import {
  formatTransitHistorySummary,
  resetTransitHistoryState,
  type TransitHistoryState,
} from "./transitHistory";
import type { AppSimulationRuntime } from "./v4Runtime";
import {
  applyDynamicVisualizationState,
  clearFixedComparisonRange,
  displayFluxFromStep,
  initializeVisualizationState,
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
import { fallbackStepV3 } from "./frameLoopFallback";

let noiseErrorLogged = false;

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

export function createFrameLoopController(deps: FrameLoopDeps): {
  frame: (now: number) => void;
  setRunning: (next: boolean) => void;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  seekToTime: (targetSec: number, opts?: { resetNoise?: boolean }) => void;
} {
  const {
    refs,
    renderer,
    plot,
    state,
    getSimulation,
    getParams,
    getBinaryLabState,
    isBinaryModeActive,
    uiWarningText,
    onSampleStep,
    renderOcPanel,
  } = deps;

  initializeVisualizationState(state);

  function setRunning(next: boolean): void {
    const uiState = setRunningState(next, refs.btnStart);
    state.running = uiState.running;
    state.last = uiState.last;
  }

  function sampleFluxForPlot(
    simulation: AppSimulationRuntime,
    params: SystemParams,
    plotMode: string,
    tSec: number,
    dtSec: number,
    noiseState = state.noise.noiseState,
    stepAtTime?: SimulationStepV3,
  ): number {
    const sampledStep = stepAtTime && stepAtTime.tObsSec === tSec ? stepAtTime : simulation.step(tSec);
    const fluxPhysical = sampledStep.flux.total;
    let fluxForPlot = fluxPhysical;
    if (plotMode === "measured") {
      const ph = params.star.photometry;
      const smearOn = (ph?.cadenceSec ?? 0) > 0 && (ph?.nSubsamples ?? 1) > 1;
      const fluxSmeared = smearOn
        ? smearedFluxAt((ti) => simulation.step(ti).flux.total, tSec, {
            cadenceSec: ph?.cadenceSec,
            nSubsamples: ph?.nSubsamples,
            clamp01: readClampSmearedFlux(refs.clampSmearedFlux),
            maxSubsamples: 512,
          })
        : fluxPhysical;
      fluxForPlot = applyInstrumentNoiseAndSystematics({
        flux: fluxSmeared,
        tSec,
        dtSec,
        cfg: getInstrumentCfgFromPhotometry(ph),
        state: noiseState,
      });
    }
    if (plotMode !== "measured") {
      const displayFlux = sampledStep.debug?.displayFluxValue;
      if (displayFlux !== undefined && Number.isFinite(displayFlux)) return displayFlux;
    }
    return scaleFluxForDisplay(fluxForPlot, state.displayFluxScale);
  }

  function resetSimTimeAndLC(opts: { resetNoise?: boolean } = {}): void {
    const simulation = getSimulation();
    const params = getParams();
    setRunning(false);
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
    renderOcPanel();
    const resetNoise = opts.resetNoise ?? true;
    if (resetNoise) {
      state.noise = resetNoiseState(state.noise);
    } else {
      resetInstrumentNoiseState(state.noise.noiseState, { resetRng: false, seed: state.noise.noiseSeed });
    }

    let step0: SimulationStepV3;
    let errorMessage = "";
    try {
      step0 = simulation.step(0);
      state.lastStepV3 = step0;
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      step0 = fallbackStepV3(0, params, state.lastStepV3 ?? undefined);
    }
    const plotMode = readPlotMode(refs.plotMode);
    const fluxDisplay0 = resolveDisplayFlux(
      sampleFluxForPlot(simulation, params, plotMode, 0, 0, state.noise.noiseState, step0),
      displayFluxFromStep(step0, state.displayFluxScale),
      state.lastFluxForPlot,
      { preferLastFinite: false },
    );
    const trackingMode = readPlotTrackingMode(refs.plotTrackingMode);
    if (trackingMode === "fixed") {
      try {
        rebuildFixedPlot({ simulation, params, plotMode, state, plot, renderer, sampleFluxForPlot, step0 });
        state.lastPlottedT = Number.NaN;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = "fixed";
      } catch (e) {
        if (refs.warnVal && !errorMessage)
          refs.warnVal.textContent = e instanceof Error ? e.message : String(e);
      }
    } else {
      clearFixedComparisonRange(state, plot);
      pushFinitePlotSample(plot, fluxDisplay0, 0);
      pushHistorySamples(state, step0, 0, plotMode === "measured" ? fluxDisplay0 : undefined);
      state.lastPlottedT = 0;
      state.lastPlotMode = plotMode;
      state.lastPlotTrackingMode = trackingMode;
      applyDynamicVisualizationState({ simulation, params, step: step0, plotMode, state, plot, renderer });
    }
    setText(refs.tVal, "0.0");
    setText(refs.fluxVal, fluxDisplay0.toFixed(6));
    state.lastFluxForPlot = fluxDisplay0;
    if (refs.warnVal) refs.warnVal.textContent = errorMessage;
  }

  function seekToTime(targetSec: number, opts: { resetNoise?: boolean } = {}): void {
    const simulation = getSimulation();
    const params = getParams();
    const trackingMode = readPlotTrackingMode(refs.plotTrackingMode);
    const plotMode = readPlotMode(refs.plotMode);
    const resetNoise = opts.resetNoise ?? false;

    setRunning(false);
    state.t = targetSec;
    state.last = performance.now();
    if (resetNoise) {
      state.noise = resetNoiseState(state.noise);
    }

    let stepV3: SimulationStepV3;
    try {
      stepV3 = simulation.step(state.t);
      state.lastStepV3 = stepV3;
      const runtimeStatus = simulation.takeStatusMessage?.();
      if (refs.warnVal) refs.warnVal.textContent = runtimeStatus ?? uiWarningText(params) ?? "";
    } catch (e) {
      if (refs.warnVal) refs.warnVal.textContent = e instanceof Error ? e.message : String(e);
      stepV3 = fallbackStepV3(state.t, params, state.lastStepV3 ?? undefined);
    }

    if (trackingMode === "fixed") {
      try {
        rebuildFixedPlot({ simulation, params, plotMode, state, plot, renderer, sampleFluxForPlot, step0: stepV3 });
        state.lastPlottedT = Number.NaN;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = "fixed";
      } catch {
        // Keep the current sample rendering below even if the preview rebuild fails.
      }
      state.lastFluxForPlot = displayFluxFromStep(stepV3, state.displayFluxScale);
    } else {
      clearFixedComparisonRange(state, plot);
      if (trackingMode !== state.lastPlotTrackingMode) {
        plot.clear();
        state.lastPlottedT = Number.NaN;
        state.lastPlotMode = null;
      }
      const fluxForPlot = sampleFluxForPlot(
        simulation,
        params,
        plotMode,
        state.t,
        0,
        state.noise.noiseState,
        stepV3,
      );
      pushFinitePlotSample(plot, fluxForPlot, state.t);
      pushHistorySamples(state, stepV3, state.t, plotMode === "measured" ? fluxForPlot : undefined);
      state.lastPlottedT = state.t;
      state.lastPlotMode = plotMode;
      state.lastPlotTrackingMode = trackingMode;
      state.lastFluxForPlot = resolveDisplayFlux(
        fluxForPlot,
        displayFluxFromStep(stepV3, state.displayFluxScale),
        state.lastFluxForPlot,
      );
      applyDynamicVisualizationState({ simulation, params, step: stepV3, plotMode, state, plot, renderer });
    }

    if (!isBinaryModeActive() || getBinaryLabState().skyVisible) {
      renderScene({
        renderer,
        step: stepV3,
        params,
        tSec: state.t,
      });
    }
    plot.setOptions({ title: state.displayFluxTitle });
    plot.draw();
    setText(refs.tVal, state.t.toFixed(1));
    setText(
      refs.fluxVal,
      resolveDisplayFlux(
        state.lastFluxForPlot,
        displayFluxFromStep(stepV3, state.displayFluxScale),
        state.lastFluxForPlot,
      ).toFixed(6),
    );
    if (refs.plotModeVal) refs.plotModeVal.textContent = plotMode;
    if (refs.nOccultersVal) refs.nOccultersVal.textContent = String(stepV3.debug?.nOcculters ?? "");
    if (refs.vPlanetVal) {
      const vp = stepV3.renderSignals.visibilityFractions.planet;
      refs.vPlanetVal.textContent = typeof vp === "number" && Number.isFinite(vp) ? vp.toFixed(3) : "";
    }
    if (refs.vMoonVal) {
      const vm = stepV3.renderSignals.visibilityFractions.moon;
      refs.vMoonVal.textContent = typeof vm === "number" && Number.isFinite(vm) ? vm.toFixed(3) : "";
    }
    onSampleStep(stepV3, state.t);
  }

  function frame(now: number): void {
    const simulation = getSimulation();
    const params = getParams();
    const dtReal = computeFrameDt(now, state.last);
    state.last = now;
    const speed = readTimeSpeed(refs.timeSpeed, refs.timeSpeedVal, refs.timeSpeedMultiplier);
    const dtSim = state.running ? dtReal * speed : 0;
    if (state.running) state.t += dtSim;
    const plotMode = readPlotMode(refs.plotMode);
    const plotTrackingMode = readPlotTrackingMode(refs.plotTrackingMode);
    let stepV3: SimulationStepV3;
    try {
      stepV3 = simulation.step(state.t);
      state.lastStepV3 = stepV3;
      const runtimeStatus = simulation.takeStatusMessage();
      if (refs.warnVal) refs.warnVal.textContent = runtimeStatus ?? uiWarningText(params) ?? "";
    } catch (e) {
      if (state.running) state.t -= dtSim;
      setRunning(false);
      if (refs.warnVal) refs.warnVal.textContent = e instanceof Error ? e.message : String(e);
      stepV3 = fallbackStepV3(state.t, params, state.lastStepV3 ?? undefined);
    }
    if (plotTrackingMode !== state.lastPlotTrackingMode && plotTrackingMode !== "fixed") {
      clearFixedComparisonRange(state, plot);
      plot.clear();
      state.lastPlottedT = Number.NaN;
      state.lastPlotMode = null;
    }

    if (
      plotTrackingMode === "fixed" &&
      (state.lastPlotTrackingMode !== "fixed" ||
        plotMode !== state.lastPlotMode ||
        !Number.isFinite(state.lastPlottedT))
    ) {
      try {
        rebuildFixedPlot({ simulation, params, plotMode, state, plot, renderer, sampleFluxForPlot });
        state.lastPlottedT = Number.NaN;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = "fixed";
      } catch {
        // Ignore preview rebuild errors here; the live frame state below still updates the readouts.
      }
    }

    const shouldSample =
      plotTrackingMode !== "fixed" &&
      (!Number.isFinite(state.lastPlottedT) ||
        state.t !== state.lastPlottedT ||
        plotMode !== state.lastPlotMode);
    let fluxForPlot = state.lastFluxForPlot;
    if (shouldSample) {
      try {
        fluxForPlot = sampleFluxForPlot(
          simulation,
          params,
          plotMode,
          state.t,
          dtSim,
          state.noise.noiseState,
          stepV3,
        );
        pushFinitePlotSample(plot, fluxForPlot, state.t);
        pushHistorySamples(state, stepV3, state.t, plotMode === "measured" ? fluxForPlot : undefined);
        state.lastPlottedT = state.t;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = plotTrackingMode;
        state.lastFluxForPlot = resolveDisplayFlux(
          fluxForPlot,
          displayFluxFromStep(stepV3, state.displayFluxScale),
          state.lastFluxForPlot,
        );
      } catch (_noiseErr) {
        // Noise pipeline error — fall back to physical flux (log once to aid debugging).
        if (!noiseErrorLogged) {
          noiseErrorLogged = true;
          console.warn("[frameLoop] noise pipeline error, falling back to physical flux:", _noiseErr);
        }
        fluxForPlot = displayFluxFromStep(stepV3, state.displayFluxScale);
        pushFinitePlotSample(plot, fluxForPlot, state.t);
        pushHistorySamples(state, stepV3, state.t, undefined);
        state.lastPlottedT = state.t;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = plotTrackingMode;
        state.lastFluxForPlot = fluxForPlot;
      }
    }

    if (plotTrackingMode !== "fixed") {
      applyDynamicVisualizationState({ simulation, params, step: stepV3, plotMode, state, plot, renderer });
    }

    if (!isBinaryModeActive() || getBinaryLabState().skyVisible) {
      renderScene({
        renderer,
        step: stepV3,
        params,
        tSec: state.t,
      });
    }
    plot.setOptions({ title: state.displayFluxTitle });
    plot.draw();
    setText(refs.tVal, state.t.toFixed(1));
    const fluxForDisplay = resolveDisplayFlux(
      fluxForPlot,
      displayFluxFromStep(stepV3, state.displayFluxScale),
      state.lastFluxForPlot,
    );
    setText(refs.fluxVal, fluxForDisplay.toFixed(6));
    if (refs.plotModeVal) refs.plotModeVal.textContent = plotMode;
    if (refs.nOccultersVal) refs.nOccultersVal.textContent = String(stepV3.debug?.nOcculters ?? "");
    if (refs.vPlanetVal) {
      const vp = stepV3.renderSignals.visibilityFractions.planet;
      refs.vPlanetVal.textContent = typeof vp === "number" && Number.isFinite(vp) ? vp.toFixed(3) : "";
    }
    if (refs.vMoonVal) {
      const vm = stepV3.renderSignals.visibilityFractions.moon;
      refs.vMoonVal.textContent = typeof vm === "number" && Number.isFinite(vm) ? vm.toFixed(3) : "";
    }
    if (shouldSample) onSampleStep(stepV3, state.t);
    requestAnimationFrame(frame);
  }

  return { frame, setRunning, resetSimTimeAndLC, seekToTime };
}
