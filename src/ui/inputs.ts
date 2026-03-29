// src/ui/inputs.ts
//
// UI input helpers + sanitizers.

import { clamp, toFiniteNumber, ECC_MAX } from "../core/units";

// TODO: plotMode and clampSmearedFlux are read directly from the DOM via getElementById.
// They should be added to UiRefs for consistency with all other UI element lookups.
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

/**
 * Clamps `v` into [lo, hi]. The name is misleading: it does not enforce positivity,
 * it is effectively `clamp(v, lo, hi)`. Callers frequently pass `lo = 0`.
 * Kept as-is to avoid a large rename across ~40 call sites.
 */
export function sanitizePositive(v: number, lo: number, hi: number): number {
  return clamp(v, lo, hi);
}

export function sanitizeFinite(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}
