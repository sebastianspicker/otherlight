// src/main.ts - UI wiring + animation loop.
import "./style.css";
import type { SystemParams } from "./core/types";
import type { PhysicsDiagnosticsV3, RenderSignalsV3, SimulationStepV3 } from "./sim/v3";
import { setText } from "./core/dom";
import type { RuntimeModeV4 } from "./sim/v4";
import { Canvas2DRenderer, LightCurvePlot } from "./render/canvas2d";
import { renderScene } from "./render/scene";
import { smearedFluxAt } from "./photometry/smearing";
import { applyInstrumentNoiseAndSystematics, resetInstrumentNoiseState } from "./photometry/instrumentNoise";
import { cloneParams } from "./app/scenario";
import { buildBinaryLabParams, DEFAULT_BINARY_LAB_CONFIG_V4 } from "./app/binaryLab";
import { PRESETS, getPresetById } from "./app/presets";
import {
  REAL_SYSTEMS_OPTIONS,
  buildParamsFromRealSystem,
  formatRealSystemMeta,
  getRealSystemById,
} from "./app/realSystems";
import { wireDebugDOM } from "./app/debug";
import { computeFrameDt } from "./app/runtime";
import { createSimulationRuntimeV4FromParams } from "./app/v4Runtime";
import { uiWarningText } from "./app/warnings";
import {
  getInstrumentCfgFromPhotometry,
  initNoiseState,
  syncNoiseStateFromParams,
  type NoiseState,
} from "./app/noise";
import { readTimeSpeed, resetNoiseState, setRunningState, syncSliderMirrorsFromInputs } from "./app/actions";
import {
  exportOcCsv,
  formatOcFitSummary,
  formatOcPanelStats,
  renderOcHistoryCanvas,
  type OcBody,
  type OcTrendMode,
  type OcUnit,
} from "./app/ocPlot";
import {
  createTransitHistoryState,
  formatTransitHistorySummary,
  resetTransitHistoryState,
  updateTransitHistoryFromStep,
} from "./app/transitHistory";
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
import { compareScenariosAtTime, interpretDidacticComparison } from "./didactics";
import {
  canEditParams,
  canRevealSky,
  createBinaryLabState,
  revealSky,
  setHypothesis,
  type BinaryLabHypothesis,
  type BinaryLabState,
} from "./didactics/binaryLab";
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
  simModeSelect,
  runtimeModeSelect,
  presetSelect,
  presetDesc,
  realSystemSelect,
  realSystemMeta,
  skyBlackboxHint,
  plotModeVal,
  warnVal,
  nOccultersVal,
  vPlanetVal,
  vMoonVal,
  timingHistoryVal,
  ocCanvas,
  ocBodySelect,
  ocUnitSelect,
  ocTrendModeSelect,
  ocExportBtn,
  ocClearBtn,
  ocStatsVal,
  ocFitVal,
  didLessonSelect,
  didAutoAssess,
  didCheckBtn,
  didNextBtn,
  didExportBtn,
  didComparePreset,
  didCompareTime,
  didCompareBtn,
  didHypothesisSelect,
  didRevealSkyBtn,
  btnApplyParams,
  btnResetParams,
} = uiRefs;
let scenarioDefaults: SystemParams = buildBinaryLabParams();
let params: SystemParams = cloneParams(scenarioDefaults);
ensureDidacticsConfig(params);
let simulation: ReturnType<typeof createSimulationRuntimeV4FromParams> = createRuntimeFromParams(params);
let noise: NoiseState = initNoiseState(params);
let didacticsRuntime: DidacticsRuntimeState = initDidacticsRuntime(params, 0);
const renderer = new Canvas2DRenderer(skyCanvas);
const plot = new LightCurvePlot(lcCanvas, 900);
let running = false;
let t = 0; // [s]
let last = performance.now();
let lastPlottedT = Number.NaN;
let lastPlotMode: string | null = null;
let lastFluxForPlot = 1;
let lastStepV3: SimulationStepV3 | null = null;
let binaryLabState: BinaryLabState = createBinaryLabState(DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab);
let transitHistory = createTransitHistoryState();
let ocBody: OcBody = "planet";
let ocUnit: OcUnit = "s";
let ocTrendMode: OcTrendMode = "raw";
const BINARY_MODE_VALUE = "binary-lab";
const PRESET_MODE_VALUE = "preset-lab";
const BINARY_HYPOTHESIS_VALUES: BinaryLabHypothesis[] = [
  "primary-eclipse-deepest",
  "secondary-eclipse-dominates",
  "eccentricity-shifts-eclipse-spacing",
];
function isBinaryHypothesis(value: string): value is BinaryLabHypothesis {
  return BINARY_HYPOTHESIS_VALUES.includes(value as BinaryLabHypothesis);
}
function isBinaryModeActive(): boolean {
  return (simModeSelect?.value ?? BINARY_MODE_VALUE) === BINARY_MODE_VALUE;
}
function readRuntimeModeFromUi(): RuntimeModeV4 {
  return runtimeModeSelect?.value === "reference" ? "reference" : "realtime";
}
function createRuntimeFromParams(
  system: SystemParams,
): ReturnType<typeof createSimulationRuntimeV4FromParams> {
  return createSimulationRuntimeV4FromParams({
    system,
    binaryMode: isBinaryModeActive(),
    runtimeMode: readRuntimeModeFromUi(),
    binaryLabDefaults: DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
  });
}
function lockParameterPanel(locked: boolean): void {
  const form = document.getElementById("paramForm");
  if (!form) return;
  const controls = form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement
  >("input, select, button, textarea");
  for (const ctrl of controls) {
    ctrl.disabled = locked;
  }
}
function syncBinaryLabUiState(): void {
  const active = isBinaryModeActive();
  const skyVisible = !active || binaryLabState.skyVisible;
  const canEdit = !active || canEditParams(binaryLabState);
  const canReveal = active && canRevealSky(binaryLabState) && !binaryLabState.revealed;
  if (didHypothesisSelect) didHypothesisSelect.disabled = !active;
  if (didRevealSkyBtn) didRevealSkyBtn.disabled = !canReveal;
  if (skyBlackboxHint) skyBlackboxHint.hidden = skyVisible;
  skyCanvas.style.visibility = skyVisible ? "visible" : "hidden";
  lockParameterPanel(!canEdit);
}
function renderOcPanel(): void {
  renderOcHistoryCanvas(ocCanvas, transitHistory, ocBody, { unit: ocUnit, trendMode: ocTrendMode });
  if (ocStatsVal)
    ocStatsVal.textContent = formatOcPanelStats(transitHistory, ocBody, {
      unit: ocUnit,
      trendMode: ocTrendMode,
    });
  if (ocFitVal) ocFitVal.textContent = formatOcFitSummary(transitHistory, ocBody, { unit: ocUnit });
}
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
  simulation = createRuntimeFromParams(params);
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
  transitHistory = resetTransitHistoryState(transitHistory);
  if (timingHistoryVal) timingHistoryVal.textContent = formatTransitHistorySummary(transitHistory);
  renderOcPanel();
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
  syncBinaryLabUiState();
}
async function applyRealSystemById(id: string): Promise<void> {
  const entry = getRealSystemById(id);
  if (!entry) return;
  scenarioDefaults = buildParamsFromRealSystem(id);
  params = cloneParams(scenarioDefaults);
  ensureDidacticsConfig(params);
  didacticsRuntime = initDidacticsRuntime(params, t);
  loadParamsIntoUI(params, uiRefs);
  syncAllEnableStates(uiRefs);
  syncSliderMirrorsFromInputs();
  syncDidacticsControlsFromParams(params, uiRefs);
  if (realSystemMeta) realSystemMeta.textContent = formatRealSystemMeta(entry);
  noise = syncNoiseStateFromParams(noise, params);
  await rebuildSimulationFromParams();
  resetSimTimeAndLC({ resetNoise: true });
  syncBinaryLabUiState();
}
async function applyBinaryLabScenario(): Promise<void> {
  scenarioDefaults = buildBinaryLabParams(DEFAULT_BINARY_LAB_CONFIG_V4);
  params = cloneParams(scenarioDefaults);
  ensureDidacticsConfig(params);
  didacticsRuntime = initDidacticsRuntime(params, t);
  binaryLabState = createBinaryLabState(DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab);
  if (realSystemSelect) realSystemSelect.value = "";
  if (realSystemMeta) realSystemMeta.textContent = "";
  if (didHypothesisSelect) didHypothesisSelect.value = "";
  presetDesc.textContent = "Binary lab (detached eclipsing): black-box flow with hypothesis gating.";
  loadParamsIntoUI(params, uiRefs);
  syncAllEnableStates(uiRefs);
  syncSliderMirrorsFromInputs();
  syncDidacticsControlsFromParams(params, uiRefs);
  noise = syncNoiseStateFromParams(noise, params);
  await rebuildSimulationFromParams();
  resetSimTimeAndLC({ resetNoise: true });
  syncBinaryLabUiState();
}
async function applyActiveScenarioForMode(): Promise<void> {
  if (isBinaryModeActive()) {
    await applyBinaryLabScenario();
    return;
  }
  const realId = realSystemSelect?.value ?? "";
  if (realId) {
    await applyRealSystemById(realId);
    return;
  }
  await applyPresetById(presetSelect.value);
}
timeSpeed.addEventListener("input", () => void readTimeSpeed(timeSpeed, timeSpeedVal));
readTimeSpeed(timeSpeed, timeSpeedVal);
btnStart.addEventListener("click", () => setRunning(!running));
btnReset.addEventListener("click", () => resetSimTimeAndLC({ resetNoise: true }));
btnClearLC.addEventListener("click", () => {
  plot.clear();
  lastPlottedT = Number.NaN;
  lastPlotMode = null;
});
btnApplyParams.addEventListener("click", async () => {
  if (isBinaryModeActive() && !canEditParams(binaryLabState)) {
    if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
    return;
  }
  params = readUIIntoParams(params, uiRefs, scenarioDefaults);
  ensureDidacticsConfig(params);
  didacticsRuntime = initDidacticsRuntime(params, t);
  noise = syncNoiseStateFromParams(noise, params);
  syncAllEnableStates(uiRefs);
  // Deterministic: if LD configured, preload before resetting time/LC so first frame uses LD.
  await rebuildSimulationFromParams();
  resetSimTimeAndLC({ resetNoise: true });
  syncBinaryLabUiState();
});
btnResetParams.addEventListener("click", async () => {
  if (isBinaryModeActive() && !canEditParams(binaryLabState)) {
    if (warnVal) warnVal.textContent = "Set a hypothesis first to unlock parameter editing.";
    return;
  }
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
  syncBinaryLabUiState();
});
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
  if (!isBinaryModeActive() || binaryLabState.skyVisible) {
    renderScene({
      renderer,
      step: stepV3,
      params,
      tSec: t,
    });
  }
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
    const changed = updateTransitHistoryFromStep({
      state: transitHistory,
      step: stepV3,
      system: params,
      tNowSec: t,
    });
    if ((changed || !timingHistoryVal?.textContent) && timingHistoryVal) {
      timingHistoryVal.textContent = formatTransitHistorySummary(transitHistory);
    }
    if (changed) renderOcPanel();
  }
  requestAnimationFrame(frame);
}
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
  presetSelect.addEventListener("change", () => {
    if (simModeSelect && simModeSelect.value !== PRESET_MODE_VALUE) simModeSelect.value = PRESET_MODE_VALUE;
    if (realSystemSelect) realSystemSelect.value = "";
    if (realSystemMeta) realSystemMeta.textContent = "";
    void applyActiveScenarioForMode();
  });
  if (realSystemSelect) {
    realSystemSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— choose real system —";
    realSystemSelect.appendChild(placeholder);
    for (const sys of REAL_SYSTEMS_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = sys.id;
      opt.textContent = sys.label;
      realSystemSelect.appendChild(opt);
    }
    realSystemSelect.value = "";
    realSystemSelect.disabled = REAL_SYSTEMS_OPTIONS.length === 0;
    if (realSystemMeta) realSystemMeta.textContent = "";
    realSystemSelect.addEventListener("change", () => {
      if (simModeSelect && simModeSelect.value !== PRESET_MODE_VALUE) simModeSelect.value = PRESET_MODE_VALUE;
      const id = realSystemSelect.value;
      if (!id) {
        if (realSystemMeta) realSystemMeta.textContent = "";
        void applyActiveScenarioForMode();
        return;
      }
      void applyActiveScenarioForMode();
    });
  }
  if (simModeSelect) {
    simModeSelect.value = BINARY_MODE_VALUE;
    simModeSelect.addEventListener("change", () => {
      void applyActiveScenarioForMode();
    });
  }
  if (runtimeModeSelect) {
    runtimeModeSelect.value = "realtime";
    runtimeModeSelect.addEventListener("change", () => {
      simulation.setMode(readRuntimeModeFromUi());
      resetSimTimeAndLC({ resetNoise: false });
    });
  }
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
    renderDidacticComparison(uiRefs, interpretDidacticComparison(cmp));
  });
  didHypothesisSelect?.addEventListener("change", () => {
    const selected = didHypothesisSelect.value;
    if (isBinaryHypothesis(selected)) {
      binaryLabState = setHypothesis(binaryLabState, selected);
      if (warnVal) warnVal.textContent = "";
    } else {
      binaryLabState = { ...binaryLabState, hypothesis: undefined };
    }
    syncBinaryLabUiState();
  });
  didRevealSkyBtn?.addEventListener("click", () => {
    binaryLabState = revealSky(binaryLabState);
    syncBinaryLabUiState();
  });
  if (ocBodySelect) {
    ocBody = ocBodySelect.value === "moon" ? "moon" : "planet";
    ocBodySelect.addEventListener("change", () => {
      ocBody = ocBodySelect.value === "moon" ? "moon" : "planet";
      renderOcPanel();
    });
  }
  if (ocUnitSelect) {
    ocUnit = ocUnitSelect.value === "ms" ? "ms" : "s";
    ocUnitSelect.addEventListener("change", () => {
      ocUnit = ocUnitSelect.value === "ms" ? "ms" : "s";
      renderOcPanel();
    });
  }
  if (ocTrendModeSelect) {
    ocTrendMode =
      ocTrendModeSelect.value === "fit"
        ? "fit"
        : ocTrendModeSelect.value === "detrended"
          ? "detrended"
          : "raw";
    ocTrendModeSelect.addEventListener("change", () => {
      ocTrendMode =
        ocTrendModeSelect.value === "fit"
          ? "fit"
          : ocTrendModeSelect.value === "detrended"
            ? "detrended"
            : "raw";
      renderOcPanel();
    });
  }
  ocExportBtn?.addEventListener("click", () => {
    exportOcCsv(transitHistory, ocBody, { unit: ocUnit, trendMode: ocTrendMode });
  });
  ocClearBtn?.addEventListener("click", () => {
    transitHistory = resetTransitHistoryState(transitHistory);
    if (timingHistoryVal) timingHistoryVal.textContent = formatTransitHistorySummary(transitHistory);
    renderOcPanel();
  });
  wireParamSliders(uiRefs);
  wireEnableHandlers(uiRefs);
  wireDebugDOM(renderer);
  await applyActiveScenarioForMode();
  renderDidacticSignals(uiRefs, didacticsRuntime);
  syncBinaryLabUiState();
  renderOcPanel();
  requestAnimationFrame(frame);
}
void init();
