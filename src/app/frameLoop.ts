import { setText } from "../core/dom";
import type { SystemParams } from "../core/types";
import type { PhysicsDiagnosticsV3, RenderSignalsV3, SimulationStepV3 } from "../sim/v3";
import type { BinaryLabState } from "../didactics/binaryLab";
import { scaleFluxForDisplay } from "./displayFlux";
import {
  applyInstrumentNoiseAndSystematics,
  createInstrumentNoiseState,
  resetInstrumentNoiseState,
} from "../photometry/instrumentNoise";
import { smearedFluxAt } from "../photometry/smearing";
import { renderScene } from "../render/scene";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
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

let noiseErrorLogged = false;
const FIXED_PLOT_SAMPLE_COUNT = 256;
const FIXED_PLOT_MIN_HALF_WINDOW_SEC = 6 * 3600;

function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function fallbackFlux(step?: SimulationStepV3): SimulationStepV3["flux"] {
  return {
    total: step?.flux.total ?? 1,
    transitFactor: step?.flux.transitFactor ?? 1,
    stellarPreTransit: step?.flux.stellarPreTransit ?? 1,
    stellarVariability: step?.flux.stellarVariability ?? 0,
    planetPhase: step?.flux.planetPhase ?? 0,
    moonPhase: step?.flux.moonPhase ?? 0,
    forwardScattering: step?.flux.forwardScattering ?? 0,
    ringScattering: step?.flux.ringScattering ?? 0,
    decomposition: step?.flux.decomposition,
  };
}

function fallbackRenderSignals(
  params: SystemParams,
  step: SimulationStepV3 | undefined,
  kinematics: SimulationStepV3["kinematics"],
  flux: SimulationStepV3["flux"],
): RenderSignalsV3 {
  return {
    occulterGeometry: step?.renderSignals.occulterGeometry ?? [],
    eventMarkers: step?.renderSignals.eventMarkers ?? [],
    timingMarkers: step?.renderSignals.timingMarkers ?? [],
    visibilityFractions: step?.renderSignals.visibilityFractions ?? {},
    fluxComponents: {
      transitFactor: flux.transitFactor,
      stellarPreTransit: flux.stellarPreTransit,
      stellarVariability: flux.stellarVariability,
      planetPhase: flux.planetPhase,
      moonPhase: flux.moonPhase,
      forwardScattering: flux.forwardScattering,
      ringScattering: flux.ringScattering,
      total: flux.total,
    },
    orbitFrames: {
      observerDir: step?.renderSignals.orbitFrames.observerDir ?? params.observer?.dir,
      planetSky: step?.renderSignals.orbitFrames.planetSky ?? kinematics.planetSky,
      moonSky: step?.renderSignals.orbitFrames.moonSky ?? kinematics.moonSky,
    },
    uncertaintyFlags: [...(step?.renderSignals.uncertaintyFlags ?? []), "fallback-step-used"],
  };
}

function fallbackPhysicsDiagnostics(params: SystemParams, step?: SimulationStepV3): PhysicsDiagnosticsV3 {
  return {
    ltteConvergence: { enabled: false, status: "disabled" },
    shapiroConvergence: { enabled: false, status: "disabled" },
    integratorStats: {
      mode: params.dynamics?.nbodyPlanetMoon?.enabled ? "fixed-verlet" : "kepler",
      nbodyEnabled: Boolean(params.dynamics?.nbodyPlanetMoon?.enabled),
      dtMaxSec: params.dynamics?.nbodyPlanetMoon?.dtMax,
      softening: params.dynamics?.nbodyPlanetMoon?.softening,
    },
    closeEncounterFlags: [...(step?.physicsDiagnostics.closeEncounterFlags ?? [])],
    energyDrift: step?.physicsDiagnostics.energyDrift,
    angularMomentumDrift: step?.physicsDiagnostics.angularMomentumDrift,
  };
}

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
  noise: NoiseState;
  transitHistory: TransitHistoryState;
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

function fallbackStepV3(
  tObsSec: number,
  params: SystemParams,
  fallback?: SimulationStepV3,
): SimulationStepV3 {
  const kinematics: SimulationStepV3["kinematics"] = {
    planetSky: fallback?.kinematics.planetSky ?? { x: 0, y: 0, z: 0 },
    moonSky: fallback?.kinematics.moonSky,
  };
  const flux = fallbackFlux(fallback);
  return {
    tObsSec,
    kinematics,
    flux,
    timing: fallback?.timing,
    observables: fallback?.observables,
    conservation: fallback?.conservation,
    didactics: fallback?.didactics,
    debug: {
      nOcculters: fallback?.debug?.nOcculters,
      bPlanet: fallback?.debug?.bPlanet,
      bMoon: fallback?.debug?.bMoon,
      tdvRatio: fallback?.debug?.tdvRatio,
      vPlanetSky: fallback?.debug?.vPlanetSky,
      vPlanetSkyRef: fallback?.debug?.vPlanetSkyRef,
      baselineFluxUsed: fallback?.debug?.baselineFluxUsed ?? flux.stellarPreTransit,
      displayFluxValue: fallback?.debug?.displayFluxValue ?? flux.total,
      stellarVariabilityFlux: fallback?.debug?.stellarVariabilityFlux ?? flux.stellarVariability,
    },
    renderSignals: fallbackRenderSignals(params, fallback, kinematics, flux),
    physicsDiagnostics: fallbackPhysicsDiagnostics(params, fallback),
  };
}

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

  function displayFluxFromStep(step: SimulationStepV3): number {
    const displayFlux = step.debug?.displayFluxValue;
    return displayFlux !== undefined && Number.isFinite(displayFlux)
      ? displayFlux
      : scaleFluxForDisplay(step.flux.total, state.displayFluxScale);
  }

  function deriveFixedPlotWindow(
    step0: SimulationStepV3,
    params: SystemParams,
  ): { startSec: number; endSec: number } {
    const timing = step0.timing;
    const durationSec = Math.max(
      finitePositive(timing?.planetTransitDurationSec) ?? 0,
      finitePositive(timing?.moonTransitDurationSec) ?? 0,
    );
    const eventExtentSec = Math.max(
      Math.abs(timing?.planetIngressSec ?? 0),
      Math.abs(timing?.planetEgressSec ?? 0),
      Math.abs(timing?.moonIngressSec ?? 0),
      Math.abs(timing?.moonEgressSec ?? 0),
    );
    const cadenceSec = finitePositive(params.star.photometry?.cadenceSec) ?? 60;
    const halfWindowSec = Math.max(
      FIXED_PLOT_MIN_HALF_WINDOW_SEC,
      cadenceSec * 256,
      durationSec * 6,
      eventExtentSec + durationSec * 2,
    );
    return { startSec: -halfWindowSec, endSec: halfWindowSec };
  }

  function rebuildFixedPlot(
    simulation: AppSimulationRuntime,
    params: SystemParams,
    plotMode: string,
    step0?: SimulationStepV3,
  ): void {
    plot.clear();
    const anchorStep = step0 ?? simulation.step(0);
    const { startSec, endSec } = deriveFixedPlotWindow(anchorStep, params);
    const sampleCount = Math.max(32, FIXED_PLOT_SAMPLE_COUNT);
    const spanSec = Math.max(1, endSec - startSec);
    const previewNoiseState = createInstrumentNoiseState(state.noise.noiseSeed);
    for (let i = 0; i < sampleCount; i++) {
      const frac = sampleCount === 1 ? 0 : i / (sampleCount - 1);
      const tSec = startSec + frac * spanSec;
      const dtSec = i === 0 ? 0 : spanSec / Math.max(1, sampleCount - 1);
      const fluxForPlot = sampleFluxForPlot(simulation, params, plotMode, tSec, dtSec, previewNoiseState);
      plot.push(fluxForPlot, tSec);
    }
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
    plot.clear();
    plot.setOptions({ title: state.displayFluxTitle });
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
    const fluxDisplay0 = displayFluxFromStep(step0);
    const trackingMode = readPlotTrackingMode(refs.plotTrackingMode);
    if (trackingMode === "fixed") {
      try {
        const plotMode = readPlotMode(refs.plotMode);
        rebuildFixedPlot(simulation, params, plotMode, step0);
        state.lastPlottedT = Number.NaN;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = "fixed";
      } catch (e) {
        if (refs.warnVal && !errorMessage)
          refs.warnVal.textContent = e instanceof Error ? e.message : String(e);
      }
    } else {
      plot.push(fluxDisplay0, 0);
      state.lastPlottedT = 0;
      state.lastPlotMode = readPlotMode(refs.plotMode);
      state.lastPlotTrackingMode = trackingMode;
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
        rebuildFixedPlot(simulation, params, plotMode, stepV3);
        state.lastPlottedT = Number.NaN;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = "fixed";
      } catch {
        // Keep the current sample rendering below even if the preview rebuild fails.
      }
      state.lastFluxForPlot = displayFluxFromStep(stepV3);
    } else {
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
      plot.push(fluxForPlot, state.t);
      state.lastPlottedT = state.t;
      state.lastPlotMode = plotMode;
      state.lastPlotTrackingMode = trackingMode;
      state.lastFluxForPlot = fluxForPlot;
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
    setText(refs.fluxVal, state.lastFluxForPlot.toFixed(6));
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
        rebuildFixedPlot(simulation, params, plotMode);
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
        plot.push(fluxForPlot, state.t);
        state.lastPlottedT = state.t;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = plotTrackingMode;
        state.lastFluxForPlot = fluxForPlot;
      } catch (_noiseErr) {
        // Noise pipeline error — fall back to physical flux (log once to aid debugging).
        if (!noiseErrorLogged) {
          noiseErrorLogged = true;
          console.warn("[frameLoop] noise pipeline error, falling back to physical flux:", _noiseErr);
        }
        fluxForPlot = displayFluxFromStep(stepV3);
        plot.push(fluxForPlot, state.t);
        state.lastPlottedT = state.t;
        state.lastPlotMode = plotMode;
        state.lastPlotTrackingMode = plotTrackingMode;
        state.lastFluxForPlot = fluxForPlot;
      }
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
    setText(refs.fluxVal, fluxForPlot.toFixed(6));
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
