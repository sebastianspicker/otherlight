// src/main.ts
//
// Main UI + animation loop glue code.
// Goals:
// - Deterministic, time-based simulation (dt in seconds)
// - Robust DOM access (fail fast if index.html mismatches)
// - Avoid dt spikes after tab switching or start/stop toggles
// - Keep parameters internally consistent (units are arbitrary "sim units", time in seconds)

import "./style.css";
import type { SystemParams } from "./core/types";
import { DEG2RAD, clamp } from "./core/units";
import { stepSystem } from "./sim/sim";
import { Canvas2DRenderer, LightCurvePlot } from "./render/canvas2d";

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

function setText(el: HTMLElement, text: string) {
  el.textContent = text;
}

// --- DOM ---
const skyCanvas = mustGet<HTMLCanvasElement>("skyCanvas");
const lcCanvas = mustGet<HTMLCanvasElement>("lcCanvas");

const btnStart = mustGet<HTMLButtonElement>("btnStart");
const btnReset = mustGet<HTMLButtonElement>("btnReset");

const timeSpeed = mustGet<HTMLInputElement>("timeSpeed");
const timeSpeedVal = mustGet<HTMLSpanElement>("timeSpeedVal");

const tVal = mustGet<HTMLSpanElement>("tVal");
const fluxVal = mustGet<HTMLSpanElement>("fluxVal");

// --- Renderers ---
const renderer = new Canvas2DRenderer(skyCanvas);
const plot = new LightCurvePlot(lcCanvas, 900);

// --- Default system (arbitrary length units, time in seconds) ---
let params: SystemParams = {
  observer: { dir: { x: 0, y: 0, z: 1 } }, // explicit observer direction (used by sim + renderer)
  star: { r: 55 },
  planet: {
    r: 12,
    orbit: {
      a: 230,
      e: 0.08,
      inc: 89.2 * DEG2RAD, // near 90° makes transits likely if node/argument align
      Omega: 0 * DEG2RAD,
      omega: 0 * DEG2RAD,
      period: 18_000, // seconds
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

// --- Simulation clock ---
let running = false;
let t = 0; // simulation time [s]
let last = performance.now();

function setRunning(next: boolean) {
  running = next;
  btnStart.textContent = running ? "Stop" : "Start";
  last = performance.now(); // prevent dt jump when toggling
}

function reset() {
  setRunning(false);
  t = 0;
  plot.clear();
  // Update readouts immediately for a clean initial state
  setText(tVal, t.toFixed(1));
  setText(fluxVal, "1.000000");
}

btnStart.addEventListener("click", () => setRunning(!running));
btnReset.addEventListener("click", reset);

function readTimeSpeed(): number {
  const v = Number(timeSpeed.value);

  // Keep speed sane even if DOM is tampered with
  const speed = Number.isFinite(v) ? clamp(v, 0, 100_000) : 1;

  setText(timeSpeedVal, `${speed}×`);
  return speed;
}

// Optional: initialize label on load (index.html may also set a default)
readTimeSpeed();

/**
 * Animation loop:
 * - dtReal is clamped to avoid large jumps after tab switches.
 * - Simulation time increases by dtReal * speed.
 */
function frame(now: number) {
  // dt in seconds; clamp prevents huge simulation jumps after tab suspension
  const dtReal = clamp((now - last) / 1000, 0, 0.1);
  last = now;

  const speed = readTimeSpeed();
  if (running) t += dtReal * speed;

  // Step physics + photometry
  const step = stepSystem(params, t);

  // Update plot + view
  plot.push(step.flux);
  renderer.drawFrame(params, step, t);
  plot.draw();

  // Update readouts
  setText(tVal, t.toFixed(1));
  setText(fluxVal, step.flux.toFixed(6));

  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
