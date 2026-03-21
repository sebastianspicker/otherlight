import { setText } from "../core/dom";
import type { SystemParams } from "../core/types";
import type { PhysicsDiagnosticsV3, RenderSignalsV3, SimulationStepV3 } from "../sim/v3";
import type { BinaryLabState } from "../didactics/binaryLab";
import { applyInstrumentNoiseAndSystematics, resetInstrumentNoiseState } from "../photometry/instrumentNoise";
import { smearedFluxAt } from "../photometry/smearing";
import { renderScene } from "../render/scene";
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import { readClampSmearedFluxFromDOM, readPlotModeFromDOM } from "../ui/inputs";
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

export type FrameLoopState = {
  running: boolean;
  t: number;
  last: number;
  lastPlottedT: number;
  lastPlotMode: string | null;
  lastFluxForPlot: number;
  lastStepV3: SimulationStepV3 | null;
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
  const planetSky = fallback?.kinematics.planetSky ?? { x: 0, y: 0, z: 0 };
  const moonSky = fallback?.kinematics.moonSky;
  const fluxTotal = fallback?.flux.total ?? 1;
  const fluxTransitFactor = fallback?.flux.transitFactor ?? 1;
  const fluxStellarPreTransit = fallback?.flux.stellarPreTransit ?? 1;
  const fluxStellarVar = fallback?.flux.stellarVariability ?? 0;
  const fluxPlanetPhase = fallback?.flux.planetPhase ?? 0;
  const fluxMoonPhase = fallback?.flux.moonPhase ?? 0;
  const fluxForwardScattering = fallback?.flux.forwardScattering ?? 0;
  const fluxRingScattering = fallback?.flux.ringScattering ?? 0;
  const renderSignals: RenderSignalsV3 = {
    occulterGeometry: fallback?.renderSignals.occulterGeometry ?? [],
    eventMarkers: fallback?.renderSignals.eventMarkers ?? [],
    timingMarkers: fallback?.renderSignals.timingMarkers ?? [],
    visibilityFractions: fallback?.renderSignals.visibilityFractions ?? {},
    fluxComponents: {
      transitFactor: fluxTransitFactor,
      stellarPreTransit: fluxStellarPreTransit,
      stellarVariability: fluxStellarVar,
      planetPhase: fluxPlanetPhase,
      moonPhase: fluxMoonPhase,
      forwardScattering: fluxForwardScattering,
      ringScattering: fluxRingScattering,
      total: fluxTotal,
    },
    orbitFrames: {
      observerDir: fallback?.renderSignals.orbitFrames.observerDir ?? params.observer?.dir,
      planetSky: fallback?.renderSignals.orbitFrames.planetSky ?? planetSky,
      moonSky: fallback?.renderSignals.orbitFrames.moonSky ?? moonSky,
    },
    uncertaintyFlags: [...(fallback?.renderSignals.uncertaintyFlags ?? []), "fallback-step-used"],
  };
  const physicsDiagnostics: PhysicsDiagnosticsV3 = {
    ltteConvergence: { enabled: false, status: "disabled" },
    shapiroConvergence: { enabled: false, status: "disabled" },
    integratorStats: {
      mode: params.dynamics?.nbodyPlanetMoon?.enabled ? "fixed-verlet" : "kepler",
      nbodyEnabled: Boolean(params.dynamics?.nbodyPlanetMoon?.enabled),
      dtMaxSec: params.dynamics?.nbodyPlanetMoon?.dtMax,
      softening: params.dynamics?.nbodyPlanetMoon?.softening,
    },
    closeEncounterFlags: [...(fallback?.physicsDiagnostics.closeEncounterFlags ?? [])],
    energyDrift: fallback?.physicsDiagnostics.energyDrift,
    angularMomentumDrift: fallback?.physicsDiagnostics.angularMomentumDrift,
  };
  return {
    tObsSec,
    kinematics: { planetSky, moonSky },
    flux: {
      total: fluxTotal,
      transitFactor: fluxTransitFactor,
      stellarPreTransit: fluxStellarPreTransit,
      stellarVariability: fluxStellarVar,
      planetPhase: fluxPlanetPhase,
      moonPhase: fluxMoonPhase,
      forwardScattering: fluxForwardScattering,
      ringScattering: fluxRingScattering,
      decomposition: fallback?.flux.decomposition,
    },
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
      baselineFluxUsed: fallback?.debug?.baselineFluxUsed ?? fluxStellarPreTransit,
      stellarVariabilityFlux: fallback?.debug?.stellarVariabilityFlux ?? fluxStellarVar,
    },
    renderSignals,
    physicsDiagnostics,
  };
}

export function createFrameLoopController(deps: FrameLoopDeps): {
  frame: (now: number) => void;
  setRunning: (next: boolean) => void;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
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

  function resetSimTimeAndLC(opts: { resetNoise?: boolean } = {}): void {
    const simulation = getSimulation();
    const params = getParams();
    setRunning(false);
    state.t = 0;
    state.lastPlottedT = Number.NaN;
    state.lastPlotMode = null;
    plot.clear();
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
    setText(refs.tVal, "0.0");
    setText(refs.fluxVal, step0.flux.total.toFixed(6));
    state.lastFluxForPlot = step0.flux.total;
    if (refs.warnVal) refs.warnVal.textContent = errorMessage;
  }

  function frame(now: number): void {
    const simulation = getSimulation();
    const params = getParams();
    const dtReal = computeFrameDt(now, state.last);
    state.last = now;
    const speed = readTimeSpeed(refs.timeSpeed, refs.timeSpeedVal);
    const dtSim = state.running ? dtReal * speed : 0;
    if (state.running) state.t += dtSim;
    const plotMode = readPlotModeFromDOM();
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
    const fluxPhysical = stepV3.flux.total;
    const shouldSample =
      !Number.isFinite(state.lastPlottedT) ||
      state.t !== state.lastPlottedT ||
      plotMode !== state.lastPlotMode;
    let fluxForPlot = state.lastFluxForPlot;
    if (shouldSample) {
      try {
        if (plotMode === "measured") {
          const ph = params.star.photometry;
          const smearOn = (ph?.cadenceSec ?? 0) > 0 && (ph?.nSubsamples ?? 1) > 1;
          const fluxSmeared = smearOn
            ? smearedFluxAt((ti) => simulation.step(ti).flux.total, state.t, {
                cadenceSec: ph?.cadenceSec,
                nSubsamples: ph?.nSubsamples,
                clamp01: readClampSmearedFluxFromDOM(),
                maxSubsamples: 512,
              })
            : fluxPhysical;
          const noiseCfg = getInstrumentCfgFromPhotometry(ph);
          fluxForPlot = applyInstrumentNoiseAndSystematics({
            flux: fluxSmeared,
            tSec: state.t,
            dtSec: dtSim,
            cfg: noiseCfg,
            state: state.noise.noiseState,
          });
        } else {
          fluxForPlot = fluxPhysical;
        }
        plot.push(fluxForPlot);
        state.lastPlottedT = state.t;
        state.lastPlotMode = plotMode;
        state.lastFluxForPlot = fluxForPlot;
      } catch (_noiseErr) {
        // Noise pipeline error — fall back to physical flux (log once to aid debugging).
        if (!noiseErrorLogged) {
          noiseErrorLogged = true;
          console.warn("[frameLoop] noise pipeline error, falling back to physical flux:", _noiseErr);
        }
        fluxForPlot = fluxPhysical;
        plot.push(fluxForPlot);
        state.lastPlottedT = state.t;
        state.lastPlotMode = plotMode;
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

  return { frame, setRunning, resetSimTimeAndLC };
}
