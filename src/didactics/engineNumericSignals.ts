/**
 * Owns engine Numeric Signals support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
import type { StepResult, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";

export type NumericSignals = {
  bPlanet: number;
  bMoon: number;
  fluxTransitFactor: number;
  tdvRatio: number;
  rvStar: number;
  rvPlanet: number;
  depthApprox: number;
  depthObserved: number;
  combinedFluxDrop: number;
  moonLeadLagSec: number;
};

function depthApproximation(system: SystemParams): number {
  const rs = toFiniteNumber(system.star.r, 1);
  const rp = toFiniteNumber(system.planet.r, 0);
  return rs > 0 ? (rp / rs) ** 2 : 0;
}

function resolveBaselineFlux(system: SystemParams, step: StepResult): number {
  const defaultBaseline = toFiniteNumber(system.star.photometry?.baselineFlux, 1);
  return toFiniteNumber(step.meta?.baselineFluxUsed, defaultBaseline);
}

function combinedFluxDrop(step: StepResult, baselineFlux: number): number {
  const displayFlux = toFiniteNumber(step.meta?.displayFluxValue, Number.NaN);
  if (Number.isFinite(displayFlux)) return Math.max(0, 1 - displayFlux);

  const fluxTotal = toFiniteNumber(step.fluxTotal, baselineFlux);
  return baselineFlux > 0 ? Math.max(0, 1 - fluxTotal / baselineFlux) : 0;
}

function moonLeadLagSec(step: StepResult): number {
  const timing = step.meta?.observables?.timing ?? step.meta?.timing;
  const moonCenterSec = timing?.moonTransitCenterSec;
  const planetCenterSec = timing?.planetTransitCenterSec;
  if (!Number.isFinite(moonCenterSec) || !Number.isFinite(planetCenterSec)) return Number.NaN;
  return (moonCenterSec as number) - (planetCenterSec as number);
}

function finiteAbs(value: unknown): number {
  return Math.abs(toFiniteNumber(value, 0));
}

/**
 * Extract the numeric signals used by rubric checks from the current system and step result.
 * All returned values are finite numbers or `Number.NaN` (never `undefined`).
 */
export function collectNumericSignals(system: SystemParams, step: StepResult): NumericSignals {
  const fluxTransitFactor = toFiniteNumber(step.fluxTransitFactor, 1);
  const baselineFlux = resolveBaselineFlux(system, step);

  return {
    bPlanet: toFiniteNumber(step.meta?.bPlanet, Number.NaN),
    bMoon: toFiniteNumber(step.meta?.bMoon, Number.NaN),
    fluxTransitFactor,
    tdvRatio: toFiniteNumber(step.meta?.tdvRatio, Number.NaN),
    rvStar: finiteAbs(step.meta?.observables?.rvStar),
    rvPlanet: finiteAbs(step.meta?.observables?.rvPlanet),
    depthApprox: depthApproximation(system),
    depthObserved: Math.max(0, 1 - fluxTransitFactor),
    combinedFluxDrop: combinedFluxDrop(step, baselineFlux),
    moonLeadLagSec: moonLeadLagSec(step),
  };
}
