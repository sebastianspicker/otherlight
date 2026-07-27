/**
 * Owns stellar Variability Components support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { StellarVariabilityParams } from "../core/types";
import { isFiniteNumber } from "../core/units";

export type StellarVariabilityComponents = {
  beamingAmp: number;
  ellipAmp: number;
  constant: number;
  flare: number;
  pulsations: number;
};

export function finiteOrZero(x: unknown): number {
  return isFiniteNumber(x) ? x : 0;
}

export function finiteOrDefault(x: unknown, def: number): number {
  return isFiniteNumber(x) ? x : def;
}

export function flareContribution(t: number, model?: StellarVariabilityParams["flare"]): number {
  if (!model?.enabled || !Number.isFinite(t)) return 0;
  const amp = Math.max(0, finiteOrZero(model.amp));
  const tPeak = finiteOrDefault(model.tPeakSec, 0);
  const riseSec = Math.max(1e-6, finiteOrDefault(model.riseSec, 300));
  const decaySec = Math.max(1e-6, finiteOrDefault(model.decaySec, 1200));
  if (amp <= 0) return 0;

  const dt = t - tPeak;
  if (dt <= 0) {
    return amp * Math.exp(-0.5 * (dt / riseSec) ** 2);
  }
  return amp * Math.exp(-dt / decaySec);
}

export function validPulsationModeContribution(
  t: number,
  mode: NonNullable<NonNullable<StellarVariabilityParams["pulsations"]>["modes"]>[number],
): number {
  const amp = finiteOrZero(mode.amp);
  const periodSec = finiteOrDefault(mode.periodSec, NaN);
  const phaseRad = finiteOrZero(mode.phaseRad);
  if (!isActivePulsationMode(amp, periodSec)) return 0;
  return amp * Math.sin((2 * Math.PI * t) / periodSec + phaseRad);
}

export function isActivePulsationMode(amp: number, periodSec: number): boolean {
  return Number.isFinite(amp) && amp !== 0 && Number.isFinite(periodSec) && periodSec > 0;
}

export function pulsationContribution(t: number, model?: StellarVariabilityParams["pulsations"]): number {
  if (!model?.enabled || !Number.isFinite(t) || !Array.isArray(model.modes)) return 0;
  let acc = 0;
  for (const mode of model.modes) {
    acc += validPulsationModeContribution(t, mode);
  }
  return Number.isFinite(acc) ? acc : 0;
}

export function normalizeClampBounds(model?: StellarVariabilityParams): {
  min: number;
  max: number;
} {
  const min0 = finiteOrDefault(model?.clampMin, -1e3);
  const max0 = finiteOrDefault(model?.clampMax, 1e3);

  // If user swaps them or provides nonsense, fall back to defaults.
  if (!Number.isFinite(min0) || !Number.isFinite(max0)) return { min: -1e3, max: 1e3 };
  if (min0 === max0) return { min: -1e3, max: 1e3 };

  const min = Math.min(min0, max0);
  const max = Math.max(min0, max0);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1e3, max: 1e3 };
  return { min, max };
}

export function variabilityComponents(
  t: number,
  model: StellarVariabilityParams,
): StellarVariabilityComponents {
  return {
    beamingAmp: finiteOrZero(model.beamingAmp),
    ellipAmp: finiteOrZero(model.ellipsoidalAmp),
    constant: finiteOrDefault(model.constant, 0),
    flare: flareContribution(t, model.flare),
    pulsations: pulsationContribution(t, model.pulsations),
  };
}

export function hasNoVariability(components: StellarVariabilityComponents): boolean {
  return Object.values(components).every((value) => value === 0);
}
