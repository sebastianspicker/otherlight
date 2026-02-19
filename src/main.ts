// src/main.ts
//
// Main UI + animation loop glue code + parameter UI bindings.
//
// Plot pipeline contract:
//
// - "physical": instantaneous runtime.step(...).flux.total
// - "measured": boxcar smearing (smearing.ts) then instrument noise (instrumentNoise.ts) with persistent state
//
// Important conventions:
// - Orbits: angles in radians (UI uses degrees for inclinations and converts).
// - Time: seconds.
// - Length: meters (SI).
//
// Robustness policy in UI layer:
// - Sanitize user inputs (finite, ranges) but keep non-physical configs possible via override mode.
// - Never allow observer.dir to be zero.
// - Measurement noise: deterministic when seed is fixed and state is preserved; reset behavior is explicit.

import "./style.css";

import type { SystemParams } from "./core/types";
import type { PhysicsDiagnosticsV3, RenderSignalsV3, SimulationRuntime, SimulationStepV3 } from "./sim/v3";

import { setText } from "./core/dom";

import { createSimulation, toSimulationConfigV3 } from "./sim/v3";

import { Canvas2DRenderer, LightCurvePlot } from "./render/canvas2d";
import { renderScene } from "./render/scene";

import { smearedFluxAt } from "./photometry/smearing";

import { applyInstrumentNoiseAndSystematics, resetInstrumentNoiseState } from "./photometry/instrumentNoise";

import { SCENARIO_DEFAULTS, cloneParams } from "./app/scenario";
import { PRESETS, getPresetById } from "./app/presets";
import { wireDebugDOM } from "./app/debug";
import { computeFrameDt } from "./app/runtime";
import { uiWarningText } from "./app/warnings";
import {
  getInstrumentCfgFromPhotometry,
  initNoiseState,
  syncNoiseStateFromParams,
  type NoiseState,
} from "./app/noise";
import { readTimeSpeed, resetNoiseState, setRunningState, syncSliderMirrorsFromInputs } from "./app/actions";
import {
  ensureDidacticsConfig,
  exportDidacticReport,
  forceNextLessonStep,
  initDidacticsRuntime,
  onDidacticSignals,
  populateDidacticsControls,
  renderDidacticComparison,
  renderDidacticSignals,
  syncDidacticsControlsFromParams,
  type DidacticsRuntimeState,
} from "./app/didactics";
import { compareScenariosAtTime } from "./didactics";

import { uiRefs } from "./ui/refs";
import { readClampSmearedFluxFromDOM, readPlotModeFromDOM } from "./ui/inputs";
import { loadParamsIntoUI, readUIIntoParams } from "./ui/params";
import { syncAllEnableStates, wireEnableHandlers } from "./ui/enable";
import { wireParamSliders } from "./ui/sliders";

const {
  skyCanvas,
  lcCanvas,
  btnStart,
  btnReset,
  btnClearLC,
  timeSpeed,
  timeSpeedVal,
  tVal,
  fluxVal,
  presetSelect,
  presetDesc,
  plotModeVal,
  warnVal,
  nOccultersVal,
  vPlanetVal,
  vMoonVal,
  didLessonSelect,
  didAutoAssess,
  didCheckBtn,
  didNextBtn,
  didExportBtn,
  didComparePreset,
  didCompareTime,
  didCompareBtn,
  btnApplyParams,
  btnResetParams,
} = uiRefs;

// Mutable, live params (UI edits go here).
let scenarioDefaults: SystemParams = cloneParams(SCENARIO_DEFAULTS);
let params: SystemParams = cloneParams(scenarioDefaults);
ensureDidacticsConfig(params);
let simulation: SimulationRuntime = createSimulation(toSimulationConfigV3(params));

let noise: NoiseState = initNoiseState(params);
let didacticsRuntime: DidacticsRuntimeState = initDidacticsRuntime(params, 0);

/* -----------------------------
 * Renderers
 * ----------------------------- */

const renderer = new Canvas2DRenderer(skyCanvas);
const plot = new LightCurvePlot(lcCanvas, 900);

/* -----------------------------
 * Simulation clock
 * ----------------------------- */

let running = false;

let t = 0; // [s]
let last = performance.now();
let lastPlottedT = Number.NaN;
let lastPlotMode: string | null = null;
let lastFluxForPlot = 1;
/** Last successful step; used as fallback when runtime.step throws (e.g. N-body maxSteps). */
let lastStepV3: SimulationStepV3 | null = null;

function fallbackStepV3(tObsSec: number, fallback?: SimulationStepV3): SimulationStepV3 {
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

async function rebuildSimulationFromParams(): Promise<void> {
  simulation = createSimulation(toSimulationConfigV3(params));
  await simulation.prepare();
}

function setRunning(next: boolean): void {
  const state = setRunningState(next, btnStart);
  running = state.running;
  last = state.last;
}

function resetSimTimeAndLC(opts: { resetNoise?: boolean } = {}): void {
  setRunning(false);
  t = 0;
  lastPlottedT = Number.NaN;
  lastPlotMode = null;

  plot.clear();
  last = performance.now();

  const resetNoise = opts.resetNoise ?? true;

  if (resetNoise) {
    // Full reset: RNG reseed + state reset.
    noise = resetNoiseState(noise);
  } else {
    // Keep RNG continuity, but reset time/correlation memory so time reset stays interpretable.
    resetInstrumentNoiseState(noise.noiseState, { resetRng: false, seed: noise.noiseSeed });
  }

  let step0: SimulationStepV3;
  let errorMessage = "";
  try {
    step0 = simulation.step(0);
    lastStepV3 = step0;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    step0 = fallbackStepV3(0, lastStepV3 ?? undefined);
  }
  setText(tVal, "0.0");
  setText(fluxVal, step0.flux.total.toFixed(6));
  lastFluxForPlot = step0.flux.total;

  if (warnVal) warnVal.textContent = errorMessage;
}

async function applyPresetById(id: string): Promise<void> {
  const preset = getPresetById(id);

  scenarioDefaults = cloneParams(preset.params);
  params = cloneParams(scenarioDefaults);
  ensureDidacticsConfig(params);
  didacticsRuntime = initDidacticsRuntime(params, t);

  loadParamsIntoUI(params, uiRefs);
  syncAllEnableStates(uiRefs);
  syncSliderMirrorsFromInputs();
  syncDidacticsControlsFromParams(params, uiRefs);

  presetDesc.textContent = preset.description;

  noise = syncNoiseStateFromParams(noise, params);

  await rebuildSimulationFromParams();
  resetSimTimeAndLC({ resetNoise: true });
}

/* -----------------------------
 * Time speed control
 * ----------------------------- */

timeSpeed.addEventListener("input", () => void readTimeSpeed(timeSpeed, timeSpeedVal));
readTimeSpeed(timeSpeed, timeSpeedVal);

/* -----------------------------
 * Event handlers
 * ----------------------------- */

btnStart.addEventListener("click", () => setRunning(!running));

btnReset.addEventListener("click", () => resetSimTimeAndLC({ resetNoise: true }));

btnClearLC.addEventListener("click", () => {
  plot.clear();
  lastPlottedT = Number.NaN;
  lastPlotMode = null;
});

btnApplyParams.addEventListener("click", async () => {
  params = readUIIntoParams(params, uiRefs, scenarioDefaults);
  ensureDidacticsConfig(params);
  didacticsRuntime = initDidacticsRuntime(params, t);

  noise = syncNoiseStateFromParams(noise, params);
  syncAllEnableStates(uiRefs);

  // Deterministic: if LD configured, preload before resetting time/LC so first frame uses LD.
  await rebuildSimulationFromParams();

  resetSimTimeAndLC({ resetNoise: true });
});

btnResetParams.addEventListener("click", async () => {
  params = cloneParams(scenarioDefaults);
  ensureDidacticsConfig(params);
  didacticsRuntime = initDidacticsRuntime(params, t);

  noise = syncNoiseStateFromParams(noise, params);
  loadParamsIntoUI(params, uiRefs);
  syncAllEnableStates(uiRefs);
  syncSliderMirrorsFromInputs();
  syncDidacticsControlsFromParams(params, uiRefs);

  await rebuildSimulationFromParams();

  resetSimTimeAndLC({ resetNoise: true });
});

/* -----------------------------
 * Animation loop
 * ----------------------------- */

function frame(now: number): void {
  const dtReal = computeFrameDt(now, last); // cap for tab-switch / lag spikes
  last = now;

  const speed = readTimeSpeed(timeSpeed, timeSpeedVal);
  const dtSim = running ? dtReal * speed : 0;

  if (running) t += dtSim;

  const plotMode = readPlotModeFromDOM();

  let stepV3: SimulationStepV3;
  try {
    stepV3 = simulation.step(t);
    lastStepV3 = stepV3;
    if (warnVal) warnVal.textContent = uiWarningText(params) ?? "";
  } catch (e) {
    if (running) t -= dtSim;
    setRunning(false);
    if (warnVal) warnVal.textContent = e instanceof Error ? e.message : String(e);
    stepV3 = fallbackStepV3(t, lastStepV3 ?? undefined);
  }

  const fluxPhysical = stepV3.flux.total;
  const shouldSample = !Number.isFinite(lastPlottedT) || t !== lastPlottedT || plotMode !== lastPlotMode;

  // "measured": smear then instrument noise (persistent state)
  let fluxForPlot = lastFluxForPlot;

  if (shouldSample) {
    try {
      if (plotMode === "measured") {
        const ph = params.star.photometry;

        const smearOn = (ph?.cadenceSec ?? 0) > 0 && (ph?.nSubsamples ?? 1) > 1;

        const fluxSmeared = smearOn
          ? smearedFluxAt((ti) => simulation.step(ti).flux.total, t, {
              cadenceSec: ph?.cadenceSec,
              nSubsamples: ph?.nSubsamples,
              clamp01: readClampSmearedFluxFromDOM(), // user-controlled; can distort additive phase curves if enabled
              maxSubsamples: 512,
            })
          : fluxPhysical;

        const noiseCfg = getInstrumentCfgFromPhotometry(ph);

        fluxForPlot = applyInstrumentNoiseAndSystematics({
          flux: fluxSmeared,
          tSec: t,
          dtSec: dtSim,
          cfg: noiseCfg,
          state: noise.noiseState,
        });
      } else {
        fluxForPlot = fluxPhysical;
      }

      plot.push(fluxForPlot);
      lastPlottedT = t;
      lastPlotMode = plotMode;
      lastFluxForPlot = fluxForPlot;
    } catch {
      fluxForPlot = fluxPhysical;
      plot.push(fluxForPlot);
      lastPlottedT = t;
      lastPlotMode = plotMode;
      lastFluxForPlot = fluxForPlot;
    }
  }

  // Renderer should be read-only; pass the simulation step result.
  renderScene({
    renderer,
    step: stepV3,
    params,
    tSec: t,
    renderConfig: simulation.getConfig().rendering,
  });

  plot.draw();

  setText(tVal, t.toFixed(1));
  setText(fluxVal, fluxForPlot.toFixed(6));

  if (plotModeVal) plotModeVal.textContent = plotMode;

  if (nOccultersVal) nOccultersVal.textContent = String(stepV3.debug?.nOcculters ?? "");

  if (vPlanetVal) {
    const vp = stepV3.renderSignals.visibilityFractions.planet;
    vPlanetVal.textContent = typeof vp === "number" && Number.isFinite(vp) ? vp.toFixed(3) : "";
  }

  if (vMoonVal) {
    const vm = stepV3.renderSignals.visibilityFractions.moon;
    vMoonVal.textContent = typeof vm === "number" && Number.isFinite(vm) ? vm.toFixed(3) : "";
  }

  if (shouldSample) {
    didacticsRuntime = onDidacticSignals(params, didacticsRuntime, stepV3.didactics?.signals, t);
    renderDidacticSignals(uiRefs, didacticsRuntime);
  }

  requestAnimationFrame(frame);
}

/* -----------------------------
 * Init
 * ----------------------------- */

async function init(): Promise<void> {
  presetSelect.replaceChildren();
  for (const preset of PRESETS) {
    const opt = document.createElement("option");
    opt.value = preset.id;
    opt.textContent = preset.label;
    presetSelect.appendChild(opt);
  }

  presetSelect.value = "default";
  presetDesc.textContent = getPresetById(presetSelect.value).description;
  presetSelect.addEventListener("change", () => void applyPresetById(presetSelect.value));

  populateDidacticsControls(uiRefs);
  syncDidacticsControlsFromParams(params, uiRefs);

  if (didComparePreset) {
    didComparePreset.replaceChildren();
    for (const preset of PRESETS) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.label;
      didComparePreset.appendChild(opt);
    }
    didComparePreset.value = "nbody-with-perturber";
  }

  didLessonSelect?.addEventListener("change", () => {
    ensureDidacticsConfig(params);
    if (params.didactics) params.didactics.activeLessonId = didLessonSelect.value;
    didacticsRuntime = initDidacticsRuntime(params, t);
    renderDidacticSignals(uiRefs, didacticsRuntime);
  });

  didAutoAssess?.addEventListener("input", () => {
    ensureDidacticsConfig(params);
    if (params.didactics) params.didactics.autoAssess = didAutoAssess.checked;
  });

  didCheckBtn?.addEventListener("click", () => {
    const step = simulation.step(t);
    didacticsRuntime = onDidacticSignals(params, didacticsRuntime, step.didactics?.signals, t);
    renderDidacticSignals(uiRefs, didacticsRuntime);
  });

  didNextBtn?.addEventListener("click", () => {
    didacticsRuntime = forceNextLessonStep(params, didacticsRuntime, t);
    renderDidacticSignals(uiRefs, didacticsRuntime);
  });

  didExportBtn?.addEventListener("click", () => {
    exportDidacticReport(params, didacticsRuntime);
  });

  didCompareBtn?.addEventListener("click", () => {
    const presetB = getPresetById(didComparePreset?.value ?? "default");
    const tCmp = Number(didCompareTime?.value ?? "0");
    const cmp = compareScenariosAtTime(params, cloneParams(presetB.params), Number.isFinite(tCmp) ? tCmp : 0);
    renderDidacticComparison(
      uiRefs,
      `ΔfluxTotal=${cmp.fluxTotalDelta.toExponential(3)}\nΔfluxTransit=${cmp.fluxTransitDelta.toExponential(3)}\nΔrvStar=${(cmp.rvStarDelta ?? 0).toExponential(3)}\nΔrvPlanet=${(cmp.rvPlanetDelta ?? 0).toExponential(3)}`,
    );
  });

  loadParamsIntoUI(params, uiRefs);

  noise = syncNoiseStateFromParams(noise, params);

  wireParamSliders(uiRefs);
  wireEnableHandlers(uiRefs);
  wireDebugDOM(renderer);

  // Ensure optional LD is available before the first runtime.step() usage if configured.
  await rebuildSimulationFromParams();

  // Show initial flux at t0.
  resetSimTimeAndLC({ resetNoise: false });
  renderDidacticSignals(uiRefs, didacticsRuntime);

  requestAnimationFrame(frame);
}

void init();
