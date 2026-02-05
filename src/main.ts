// src/main.ts
//
// Main UI + animation loop glue code + parameter UI bindings.
//
// Plot pipeline contract:
//
// - "physical": instantaneous stepSystem(...).fluxTotal
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

import { clamp, toFiniteNumber } from "./core/units";
import { setText } from "./core/dom";

import { validateSystemParamsPhysics } from "./physics/hill";

import { prepareSimulation, stepSystem } from "./sim/sim";
import { collectParamWarnings } from "./sim/validation";

import { Canvas2DRenderer, LightCurvePlot } from "./render/canvas2d";

import { smearedFluxAt } from "./photometry/smearing";

import { applyInstrumentNoiseAndSystematics, resetInstrumentNoiseState } from "./photometry/instrumentNoise";

import { SCENARIO_DEFAULTS, cloneParams } from "./app/scenario";
import { PRESETS, getPresetById } from "./app/presets";
import { wireDebugDOM } from "./app/debug";
import {
  getInstrumentCfgFromPhotometry,
  initNoiseState,
  resetNoiseStateWithSeed,
  syncNoiseStateFromParams,
  type NoiseState,
} from "./app/noise";

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
  btnApplyParams,
  btnResetParams,
} = uiRefs;

// Mutable, live params (UI edits go here).
let scenarioDefaults: SystemParams = cloneParams(SCENARIO_DEFAULTS);
let params: SystemParams = cloneParams(scenarioDefaults);

let noise: NoiseState = initNoiseState(params);

/* -----------------------------
 * Simple physical warnings
 * ----------------------------- */

function uiWarningText(p: SystemParams): string | undefined {
  const msgs = [...validateSystemParamsPhysics(p), ...collectParamWarnings(p)];
  if (!msgs.length) return undefined;

  // Prefer "warn" messages for the UI; otherwise show the first info.
  const best = msgs.find((m) => m.severity === "warn") ?? msgs.find((m) => m.severity === "info");
  return best?.message;
}

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

function setRunning(next: boolean): void {
  running = next;
  btnStart.textContent = running ? "Stop" : "Start";
  last = performance.now();
}

function resetNoiseState(): void {
  // Same seed => reproducible, but avoid “frozen” correlation after time jumps.
  noise = { ...noise, noiseState: resetNoiseStateWithSeed(noise.noiseSeed) };
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
    resetNoiseState();
  } else {
    // Keep RNG continuity, but reset time/correlation memory so time reset stays interpretable.
    resetInstrumentNoiseState(noise.noiseState, { resetRng: false, seed: noise.noiseSeed });
  }

  const step0 = stepSystem(params, 0);
  setText(tVal, "0.0");
  setText(fluxVal, step0.fluxTotal.toFixed(6));
  lastFluxForPlot = step0.fluxTotal;

  if (warnVal) warnVal.textContent = "";
}

function syncSliderMirrorsFromInputs(): void {
  // loadParamsIntoUI() sets input values directly, which won't trigger the slider mirroring listeners.
  // Dispatch `input` so range inputs stay in sync with the number inputs.
  const nums = Array.from(document.querySelectorAll("#paramForm input[type='number']")) as HTMLInputElement[];
  for (const num of nums) {
    num.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function applyPresetById(id: string): Promise<void> {
  const preset = getPresetById(id);

  scenarioDefaults = cloneParams(preset.params);
  params = cloneParams(scenarioDefaults);

  loadParamsIntoUI(params, uiRefs);
  syncAllEnableStates(uiRefs);
  syncSliderMirrorsFromInputs();

  presetDesc.textContent = preset.description;

  noise = syncNoiseStateFromParams(noise, params);

  await prepareSimulation(params);
  resetSimTimeAndLC({ resetNoise: true });
}

/* -----------------------------
 * Time speed control
 * ----------------------------- */

function readTimeSpeed(): number {
  const v = toFiniteNumber(timeSpeed.value, 1);
  const speed = clamp(v, 0, 100_000);
  setText(timeSpeedVal, `${Math.round(speed)}`);
  return speed;
}

timeSpeed.addEventListener("input", () => void readTimeSpeed());
readTimeSpeed();

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

  noise = syncNoiseStateFromParams(noise, params);
  syncAllEnableStates(uiRefs);

  // Deterministic: if LD configured, preload before resetting time/LC so first frame uses LD.
  await prepareSimulation(params);

  resetSimTimeAndLC({ resetNoise: true });
});

btnResetParams.addEventListener("click", async () => {
  params = cloneParams(scenarioDefaults);

  noise = syncNoiseStateFromParams(noise, params);
  loadParamsIntoUI(params, uiRefs);
  syncAllEnableStates(uiRefs);
  syncSliderMirrorsFromInputs();

  await prepareSimulation(params);

  resetSimTimeAndLC({ resetNoise: true });
});

/* -----------------------------
 * Animation loop
 * ----------------------------- */

function frame(now: number): void {
  const dtReal = clamp((now - last) / 1000, 0, 0.1); // cap for tab-switch / lag spikes
  last = now;

  const speed = readTimeSpeed();
  const dtSim = running ? dtReal * speed : 0;

  if (running) t += dtSim;

  // Geometry + "physical" flux at center time
  const stepCenter = stepSystem(params, t);
  const fluxPhysical = stepCenter.fluxTotal;

  const plotMode = readPlotModeFromDOM();

  const shouldSample = !Number.isFinite(lastPlottedT) || t !== lastPlottedT || plotMode !== lastPlotMode;

  // "measured": smear then instrument noise (persistent state)
  let fluxForPlot = lastFluxForPlot;

  if (shouldSample) {
    if (plotMode === "measured") {
      const ph = params.star.photometry as any;

      const smearOn = (ph?.cadenceSec ?? 0) > 0 && (ph?.nSubsamples ?? 1) > 1;

      const fluxSmeared = smearOn
        ? smearedFluxAt((ti) => stepSystem(params, ti).fluxTotal, t, {
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
  }

  // Renderer should be read-only; pass the simulation step result.
  // (If your renderer still expects legacy 'step.flux', you can add an alias here.)
  renderer.drawFrame(params, stepCenter as any, t);

  plot.draw();

  setText(tVal, t.toFixed(1));
  setText(fluxVal, fluxForPlot.toFixed(6));

  if (plotModeVal) plotModeVal.textContent = plotMode;

  if (nOccultersVal) nOccultersVal.textContent = String((stepCenter as any).meta?.nOcculters ?? "");

  if (vPlanetVal) {
    const vp = (stepCenter as any).meta?.planetVisibleFraction;
    vPlanetVal.textContent = typeof vp === "number" && Number.isFinite(vp) ? vp.toFixed(3) : "";
  }

  if (vMoonVal) {
    const vm = (stepCenter as any).meta?.moonVisibleFraction;
    vMoonVal.textContent = typeof vm === "number" && Number.isFinite(vm) ? vm.toFixed(3) : "";
  }

  const warnMsg = uiWarningText(params);
  if (warnVal) warnVal.textContent = warnMsg ?? "";

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

  loadParamsIntoUI(params, uiRefs);

  noise = syncNoiseStateFromParams(noise, params);

  wireParamSliders(uiRefs);
  wireEnableHandlers(uiRefs);
  wireDebugDOM(renderer);

  // Ensure optional LD is available before the first stepSystem() usage if configured.
  await prepareSimulation(params);

  // Show initial flux at t0.
  resetSimTimeAndLC({ resetNoise: false });

  requestAnimationFrame(frame);
}

void init();
