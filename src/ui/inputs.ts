// src/ui/inputs.ts
//
// UI input helpers + sanitizers.

import { clamp, toFiniteNumber, ECC_MAX } from "../core/units";

type PlotMode = "physical" | "measured";

export function readPlotModeFromDOM(): PlotMode {
  const el = document.getElementById("plotMode");
  if (!el) return "physical";
  if (el instanceof HTMLSelectElement) return el.value === "measured" ? "measured" : "physical";
  if (el instanceof HTMLInputElement) return el.value === "measured" ? "measured" : "physical";
  return "physical";
}

export function readClampSmearedFluxFromDOM(): boolean {
  const el = document.getElementById("clampSmearedFlux");
  if (!el) return false;
  if (el instanceof HTMLInputElement && el.type === "checkbox") return Boolean(el.checked);
  return false;
}

export function readNumberInput(el: HTMLInputElement, fallback: number): number {
  const n = Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : toFiniteNumber(el.value, NaN);
  return Number.isFinite(n) ? n : fallback;
}

export function writeNumberInput(el: HTMLInputElement, value: number): void {
  el.value = Number.isFinite(value) ? String(value) : "";
}

export function readCheckbox(el: HTMLInputElement): boolean {
  return Boolean(el.checked);
}

export function readSelect(el: HTMLSelectElement, fallback: string): string {
  const v = el.value;
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function sanitizeIncDeg(vDeg: number): number {
  return clamp(vDeg, 0, 180);
}

// Numerical stability policy (elliptic only)
export function sanitizeEcc(v: number): number {
  return clamp(v, 0, ECC_MAX);
}

export function sanitizePositive(v: number, lo: number, hi: number): number {
  return clamp(v, lo, hi);
}

export function sanitizeFinite(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}
