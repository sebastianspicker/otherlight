// src/main.ts
//
// Main UI + animation loop glue code + parameter UI bindings. 
//
// Goals: 
// - Deterministic, time-based simulation (dt in seconds)
// - Robust DOM access (fail fast if index.html mismatches)
// - Avoid dt spikes after tab switching or start/stop toggles
// - Allow user to edit radii + orbital parameters (Apply / Reset params)
// - Keep parameters physically valid via clamping (e in [0,0.95], radii>0, periods>0)
//
// Notes / correctness: 
// - Simulation time t is in seconds and is advanced by dtReal * speed, where dtReal is clamped.
// - Rendering and light-curve plotting are driven by requestAnimationFrame (variable cadence),
//   but the simulation is time-based, so motion is independent of frame rate (up to dt clamp).
// - Parameter cloning uses JSON serialization, which is safe for this plain-data config.
// - star.photometry is intentionally preserved across UI edits even though it is not exposed in UI yet.
//
// Smearing integration (finite exposure time): 
// - If cadenceSec > 0 and nSubsamples > 1, flux is computed as a boxcar average centered on t,
//   while geometry rendering stays at the center time t (stable visuals).
//
// Performance note: 
// - Smearing computes multiple stepSystem() calls per frame; keep nSubsamples modest.
//

import "./style.css"; // 

import type { SystemParams } from "./core/types"; // 
import { DEG2RAD, RAD2DEG, clamp } from "./core/units"; // 
import { stepSystem } from "./sim/sim"; // 
import { Canvas2DRenderer, LightCurvePlot } from "./render/canvas2d"; // 
import { smearedFluxAt } from "./photometry/smearing"; // 

// Optional: instrument noise layer (enable only if the module exists / is wired in main.ts). 
// import { applyInstrumentNoiseAndSystematics, createInstrumentNoiseState } from "./photometry/instrumentNoise";

type PlotMode = "physical" | "measured";

/**
 * If the HTML contains an element with id="plotMode" (e.g., a <select>),
 * this code will bind to it; otherwise it falls back to "physical". 
 */
function readPlotModeFromDOM(): PlotMode {
  const el = document.getElementById("plotMode");
  if (!el) return "physical";
  if (el instanceof HTMLSelectElement) {
    const v = el.value;
    return v === "measured" ? "measured" : "physical";
  }
  if (el instanceof HTMLInputElement) {
    const v = el.value;
    return v === "measured" ? "measured" : "physical";
  }
  return "physical";
}

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

function setText(el: HTMLElement, text: string) {
  el.textContent = text;
}

function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readNumberInput(el: HTMLInputElement, fallback: number): number {
  const n = Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : toFiniteNumber(el.value, NaN);
  return Number.isFinite(n) ? n : fallback;
}

function writeNumberInput(el: HTMLInputElement, value: number) {
  el.value = Number.isFinite(value) ? String(value) : "";
}

function setDisabled(el: HTMLInputElement, disabled: boolean) {
  el.disabled = disabled;
  el.setAttribute("aria-disabled", disabled ? "true" : "false");
}

/* -----------------------------
 * Simple physical warnings
 * ----------------------------- */

/**
 * Hill radius warning (heuristic):
 * If masses are present, warn when moon semi-major axis exceeds ~0.5 * Hill radius
 * (a common rough stability guideline for prograde satellites). 
 *
 * Units:
 * - This codebase keeps "length units" arbitrary and "mass" arbitrary, so this is only meaningful
 *   if the user’s presets use consistent units and star mass is not modeled. 
 *
 * Because SystemParams has no star mass field, this warning is strictly optional and conservative:
 * - It only triggers when both planet.m and moon.m exist and are positive AND the moon is enabled. 
 * - It uses planet.orbit.a as a proxy distance to star and assumes M_star >> M_planet, which cannot be verified here. 
 */
function hillStabilityWarningText(p: SystemParams): string | undefined {
  if (!p.moon) return undefined;

  const mp = p.planet.m;
  const ms = p.moon.m;
  if (!Number.isFinite(mp as number) || (mp as number) <= 0) return undefined;
  if (!Number.isFinite(ms as number) || (ms as number) <= 0) return undefined;

  const aPlanet = p.planet.orbit.a;
  const ePlanet = p.planet.orbit.e;
  const aMoon = p.moon.orbitAroundPlanet.a;

  if (!Number.isFinite(aPlanet) || aPlanet <= 0) return undefined;
  if (!Number.isFinite(ePlanet) || ePlanet < 0 || ePlanet >= 1) return undefined;
  if (!Number.isFinite(aMoon) || aMoon <= 0) return undefined;

  // Without a star mass, we cannot compute a true Hill radius.
  // Use a "pseudo-Hill" scaling rH ~ aPlanet(1-ePlanet) * (mp/3)^(1/3) assuming M_star = 1 in same mass units.
  // This becomes a dimensionless warning knob: user must set masses sensibly. 
  const rH = aPlanet * (1 - ePlanet) * Math.cbrt((mp as number) / 3);
  if (!Number.isFinite(rH) || rH <= 0) return undefined;

  const ratio = aMoon / rH;

  // Conservative thresholds: 0.5 is a typical "rough" prograde stability boundary; 0.7 is "very likely unstable".
  if (ratio > 0.7) return `Hill warn: a_moon / rH ≈ ${ratio.toFixed(2)} (very large; likely unstable)`;
  if (ratio > 0.5) return `Hill warn: a_moon / rH ≈ ${ratio.toFixed(2)} (large; may be unstable)`;
  return undefined;
}

/* -----------------------------
 * DOM (core)
 * ----------------------------- */

const skyCanvas = mustGet<HTMLCanvasElement>("skyCanvas");
const lcCanvas = mustGet<HTMLCanvasElement>("lcCanvas");

const btnStart = mustGet<HTMLButtonElement>("btnStart");
const btnReset = mustGet<HTMLButtonElement>("btnReset");
const btnClearLC = mustGet<HTMLButtonElement>("btnClearLC");

const timeSpeed = mustGet<HTMLInputElement>("timeSpeed");
const timeSpeedVal = mustGet<HTMLSpanElement>("timeSpeedVal");

const tVal = mustGet<HTMLSpanElement>("tVal");
const fluxVal = mustGet<HTMLSpanElement>("fluxVal");

// Optional UI element: plotMode label output (if present).
const plotModeVal = document.getElementById("plotModeVal") as HTMLSpanElement | null;

// Optional UI element: warnings output (if present).
const warnVal = document.getElementById("warnVal") as HTMLSpanElement | null;

/* -----------------------------
 * DOM (params panel)
 * ----------------------------- */

const btnApplyParams = mustGet<HTMLButtonElement>("btnApplyParams");
const btnResetParams = mustGet<HTMLButtonElement>("btnResetParams");

const starR = mustGet<HTMLInputElement>("starR");

const planetR = mustGet<HTMLInputElement>("planetR");
const planetA = mustGet<HTMLInputElement>("planetA");
const planetE = mustGet<HTMLInputElement>("planetE");
const planetInc = mustGet<HTMLInputElement>("planetInc");
const planetPeriod = mustGet<HTMLInputElement>("planetPeriod");

const moonEnabled = mustGet<HTMLInputElement>("moonEnabled");
const moonR = mustGet<HTMLInputElement>("moonR");
const moonA = mustGet<HTMLInputElement>("moonA");
const moonE = mustGet<HTMLInputElement>("moonE");
const moonInc = mustGet<HTMLInputElement>("moonInc");
const moonPeriod = mustGet<HTMLInputElement>("moonPeriod");

/* -----------------------------
 * Renderers
 * ----------------------------- */

const renderer = new Canvas2DRenderer(skyCanvas);
const plot = new LightCurvePlot(lcCanvas, 900);

/* -----------------------------
 * Default system (arbitrary length units, time in seconds)
 * ----------------------------- */

const DEFAULTPARAMS: SystemParams = {
  observer: { dir: { x: 0, y: 0, z: 1 } },
  star: {
    r: 55,
    // photometry: { ... } optionally enabled in presets. 
  },
  planet: {
    r: 12,
    orbit: {
      a: 230,
      e: 0.08,
      inc: 89.2 * DEG2RAD,
      Omega: 0 * DEG2RAD,
      omega: 0 * DEG2RAD,
      period: 18_000,
      t0: 0,
    },
  },
  moon: {
    r: 4,
    orbitAroundPlanet: {
      a: 32,
      e: 0.02,
      inc: 10 * DEG2RAD,
      Omega: 0,
      omega: 0,
      period: 2_200,
      t0: 0,
    },
  },
};

function cloneParams(p: SystemParams): SystemParams {
  return JSON.parse(JSON.stringify(p)) as SystemParams;
}

let params: SystemParams = cloneParams(DEFAULTPARAMS);

// Optional instrument-noise state (only if wired in).
// let instrumentNoiseState = createInstrumentNoiseState(params.star.photometry?.instrument?.seed ?? 1);

/* -----------------------------
 * Simulation clock
 * ----------------------------- */

let running = false;
let t = 0; // simulation time [s]
let last = performance.now();

function setRunning(next: boolean) {
  running = next;
  btnStart.textContent = running ? "Stop" : "Start";
  last = performance.now();
}

function resetSimTimeAndLC() {
  setRunning(false);
  t = 0;
  plot.clear();
  last = performance.now();
  setText(tVal, t.toFixed(1));
  setText(fluxVal, "1.000000");
  if (warnVal) warnVal.textContent = "";

  // Optional: reset instrument noise realization on reset.
  // instrumentNoiseState = createInstrumentNoiseState(params.star.photometry?.instrument?.seed ?? 1);
}

function resetAll({ keepParams = true }: { keepParams?: boolean } = {}) {
  resetSimTimeAndLC();
  if (!keepParams) {
    params = cloneParams(DEFAULTPARAMS);
    loadParamsIntoUI(params);
  }
}

btnStart.addEventListener("click", () => setRunning(!running));
btnReset.addEventListener("click", () => resetAll({ keepParams: true }));
btnClearLC.addEventListener("click", () => plot.clear());

/* -----------------------------
 * Time speed control
 * ----------------------------- */

function readTimeSpeed(): number {
  const v = toFiniteNumber(timeSpeed.value, 1);
  const speed = clamp(v, 0, 100_000);
  setText(timeSpeedVal, `${Math.round(speed)}×`);
  return speed;
}

timeSpeed.addEventListener("input", () => {
  readTimeSpeed();
});
readTimeSpeed();

/* -----------------------------
 * Params UI helpers
 * ----------------------------- */

function syncMoonInputsEnabled() {
  const en = moonEnabled.checked;
  setDisabled(moonR, !en);
  setDisabled(moonA, !en);
  setDisabled(moonE, !en);
  setDisabled(moonInc, !en);
  setDisabled(moonPeriod, !en);
}

moonEnabled.addEventListener("change", () => syncMoonInputsEnabled());

function loadParamsIntoUI(p: SystemParams) {
  writeNumberInput(starR, p.star.r);

  writeNumberInput(planetR, p.planet.r);
  writeNumberInput(planetA, p.planet.orbit.a);
  writeNumberInput(planetE, p.planet.orbit.e);
  writeNumberInput(planetInc, p.planet.orbit.inc * RAD2DEG);
  writeNumberInput(planetPeriod, p.planet.orbit.period);

  const hasMoon = Boolean(p.moon);
  moonEnabled.checked = hasMoon;

  if (hasMoon && p.moon) {
    writeNumberInput(moonR, p.moon.r);
    writeNumberInput(moonA, p.moon.orbitAroundPlanet.a);
    writeNumberInput(moonE, p.moon.orbitAroundPlanet.e);
    writeNumberInput(moonInc, p.moon.orbitAroundPlanet.inc * RAD2DEG);
    writeNumberInput(moonPeriod, p.moon.orbitAroundPlanet.period);
  } else {
    writeNumberInput(moonR, DEFAULTPARAMS.moon?.r ?? 4);
    writeNumberInput(moonA, DEFAULTPARAMS.moon?.orbitAroundPlanet.a ?? 32);
    writeNumberInput(moonE, DEFAULTPARAMS.moon?.orbitAroundPlanet.e ?? 0.02);
    writeNumberInput(moonInc, (DEFAULTPARAMS.moon?.orbitAroundPlanet.inc ?? 10 * DEG2RAD) * RAD2DEG);
    writeNumberInput(moonPeriod, DEFAULTPARAMS.moon?.orbitAroundPlanet.period ?? 2_200);
  }

  syncMoonInputsEnabled();
}

function sanitizeIncDeg(vDeg: number): number {
  // UI input is degrees; keep [0, 180]. 
  return clamp(vDeg, 0, 180);
}

function sanitizeEcc(v: number): number {
  // Elliptic only: e in [0, 0.95] in UI for numerical stability and to match prior behavior. 
  return clamp(v, 0, 0.95);
}

function sanitizePositive(v: number, lo: number, hi: number): number {
  // Generic numeric clamp with a small positive lower bound when needed.
  return clamp(v, lo, hi);
}

function readUIIntoParams(current: SystemParams): SystemParams {
  const next = cloneParams(current);

  // --- Star ---
  next.star.r = sanitizePositive(readNumberInput(starR, next.star.r), 1, 1e6);

  // Preserve star.photometry even though it is not exposed in UI controls yet. 
  next.star.photometry = next.star.photometry ?? current.star.photometry;

  // --- Planet ---
  next.planet.r = sanitizePositive(readNumberInput(planetR, next.planet.r), 0.01, 1e6);
  next.planet.orbit.a = sanitizePositive(readNumberInput(planetA, next.planet.orbit.a), 0.01, 1e9);
  next.planet.orbit.e = sanitizeEcc(readNumberInput(planetE, next.planet.orbit.e));

  const incDeg = sanitizeIncDeg(readNumberInput(planetInc, next.planet.orbit.inc * RAD2DEG));
  next.planet.orbit.inc = incDeg * DEG2RAD;

  // period must be > 0 (stepSystem validates period > 0 too). 
  next.planet.orbit.period = sanitizePositive(readNumberInput(planetPeriod, next.planet.orbit.period), 0.001, 1e12);

  // Keep these fixed for now (could be added to UI later). 
  next.planet.orbit.Omega = next.planet.orbit.Omega ?? 0;
  next.planet.orbit.omega = next.planet.orbit.omega ?? 0;
  next.planet.orbit.t0 = next.planet.orbit.t0 ?? 0;

  // --- Moon ---
  if (moonEnabled.checked) {
    if (!next.moon) {
      next.moon =
        cloneParams(DEFAULTPARAMS).moon ?? {
          r: 1,
          orbitAroundPlanet: { a: 10, e: 0, inc: 0, Omega: 0, omega: 0, period: 1000, t0: 0 },
        };
    }

    next.moon.r = sanitizePositive(readNumberInput(moonR, next.moon.r), 0.001, 1e6);
    next.moon.orbitAroundPlanet.a = sanitizePositive(
      readNumberInput(moonA, next.moon.orbitAroundPlanet.a),
      0.001,
      1e9
    );
    next.moon.orbitAroundPlanet.e = sanitizeEcc(readNumberInput(moonE, next.moon.orbitAroundPlanet.e));

    const mIncDeg = sanitizeIncDeg(readNumberInput(moonInc, next.moon.orbitAroundPlanet.inc * RAD2DEG));
    next.moon.orbitAroundPlanet.inc = mIncDeg * DEG2RAD;

    next.moon.orbitAroundPlanet.period = sanitizePositive(
      readNumberInput(moonPeriod, next.moon.orbitAroundPlanet.period),
      0.001,
      1e12
    );

    next.moon.orbitAroundPlanet.Omega = next.moon.orbitAroundPlanet.Omega ?? 0;
    next.moon.orbitAroundPlanet.omega = next.moon.orbitAroundPlanet.omega ?? 0;
    next.moon.orbitAroundPlanet.t0 = next.moon.orbitAroundPlanet.t0 ?? 0;
  } else {
    delete next.moon;
  }

  return next;
}

/* -----------------------------
 * Apply/Reset params controls
 * ----------------------------- */

btnApplyParams.addEventListener("click", () => {
  params = readUIIntoParams(params);
  resetSimTimeAndLC();
});

btnResetParams.addEventListener("click", () => {
  params = cloneParams(DEFAULTPARAMS);
  loadParamsIntoUI(params);
  resetSimTimeAndLC();
});

// Initialize UI from defaults
loadParamsIntoUI(params);

/* -----------------------------
 * Animation loop
 * ----------------------------- */

function frame(now: number) {
  const dtReal = clamp((now - last) / 1000, 0, 0.1);
  last = now;

  const speed = readTimeSpeed();
  if (running) t += dtReal * speed;

  // Always compute a center step for rendering (stable visuals). 
  const stepCenter = stepSystem(params, t);

  // Smearing: compute boxcar-averaged flux if configured. 
  const fluxPhysical = smearedFluxAt(
    (ti) => stepSystem(params, ti).flux,
    t,
    {
      cadenceSec: params.star.photometry?.cadenceSec,
      nSubsamples: params.star.photometry?.nSubsamples,
      clamp01: true,
      maxSubsamples: 512,
    }
  );

  // Optional instrument noise layer (if enabled and wired in). 
  // NOTE: If enabled, prefer plotting the measured flux when plotMode="measured".
  // const exposureSec = Number.isFinite(params.star.photometry?.cadenceSec as number)
  //   ? Math.max(0, params.star.photometry!.cadenceSec as number)
  //   : 0;
  // const fluxMeasured = applyInstrumentNoiseAndSystematics({
  //   flux: fluxPhysical,
  //   tSec: t,
  //   dtSec: dtReal * speed,
  //   cfg: params.star.photometry?.instrument
  //     ? { ...params.star.photometry.instrument, exposureSec: params.star.photometry.instrument.exposureSec ?? exposureSec }
  //     : undefined,
  //   state: instrumentNoiseState,
  // });

  // If noise layer is not enabled, "measured" falls back to "physical" by design.
  const plotMode = readPlotModeFromDOM();
  const fluxMeasured: number | undefined = undefined;

  const fluxForPlot = plotMode === "measured" ? (fluxMeasured ?? fluxPhysical) : fluxPhysical;

  plot.push(fluxForPlot);
  renderer.drawFrame(params, stepCenter, t);
  plot.draw();

  setText(tVal, t.toFixed(1));
  setText(fluxVal, fluxForPlot.toFixed(6));
  if (plotModeVal) plotModeVal.textContent = plotMode;

  const hillWarn = hillStabilityWarningText(params);
  if (warnVal) warnVal.textContent = hillWarn ?? "";

  requestAnimationFrame(frame);
}

// Ensure UI and time start in a consistent state. 
resetAll({ keepParams: true });
requestAnimationFrame(frame);
