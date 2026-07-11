import { clamp01, isFiniteNumber } from "../core/units";
import { vLen } from "../physics/vec3";
import type { BodyPhaseFluxParams, NormalizedPhaseCurveModel, NormalizedThermalInertia } from "./phaseCurve";

type PhaseCurveScales = {
  reflScale: number;
  thermScale: number;
};

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function nonNegativeFiniteOrZero(value: number | undefined): number {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function positiveFiniteOrUndefined(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : undefined;
}

export function phaseCurvePhysicalScales(
  norm: NormalizedPhaseCurveModel,
  params: BodyPhaseFluxParams,
): PhaseCurveScales {
  if (!norm.physicalScaling) return { reflScale: 1, thermScale: 1 };
  const rBodyRadius = positiveFiniteOrUndefined(params.rBodyRadius);
  if (rBodyRadius === undefined) return { reflScale: 1, thermScale: 1 };

  const r = vLen(params.rBody);
  const rStarRadius = positiveFiniteOrUndefined(params.rStarRadius);
  return {
    reflScale: r > 0 ? (rBodyRadius * rBodyRadius) / (r * r) : 0,
    thermScale: rStarRadius ? (rBodyRadius * rBodyRadius) / (rStarRadius * rStarRadius) : 1,
  };
}

export function effectiveThermalInertia(
  norm: NormalizedPhaseCurveModel,
  thermalModelAdvanced: BodyPhaseFluxParams["thermalModelAdvanced"],
): NormalizedThermalInertia {
  return thermalModelAdvanced?.enabled ? { ...norm.thermalInertia, enabled: false } : norm.thermalInertia;
}

function advancedThermalPeriod(value: number | undefined): number | undefined {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : undefined;
}

function advancedThermalResponse(period: number | undefined, tau: number): number {
  return period && tau > 0 ? 1 / Math.sqrt(1 + Math.pow((2 * Math.PI * tau) / period, 2)) : 1;
}

function advancedIrradiationScale(rStarRadius: number | undefined, rBodyDistance: number): number {
  return rStarRadius && rBodyDistance > 0 ? (rStarRadius * rStarRadius) / (rBodyDistance * rBodyDistance) : 1;
}

export function thermalAdvancedBoost(params: BodyPhaseFluxParams): number {
  const adv = params.thermalModelAdvanced;
  if (!adv?.enabled) return 1;
  const eqScale = Math.max(0, finiteOrDefault(adv.equilibriumScale, 1));
  const redistribution = clamp01(finiteOrDefault(adv.redistribution, 0.5));
  const tau = nonNegativeFiniteOrZero(adv.tauSec);
  const response = advancedThermalResponse(advancedThermalPeriod(params.orbitPeriodSec), tau);
  const irr = advancedIrradiationScale(positiveFiniteOrUndefined(params.rStarRadius), vLen(params.rBody));
  return Math.max(0, redistribution + (1 - redistribution) * eqScale * irr * response);
}
