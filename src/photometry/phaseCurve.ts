// src/photometry/phaseCurve.ts
//
// Reflection + thermal emission phase-curve utilities.
//
// Scientific scope (intentionally simple, robust, and simulator-friendly):
// - Computes an additive body flux contribution (reflection + thermal + constant floor) in
//   stellar baseline flux units (dimensionless), suitable for adding to a normalized stellar flux.
// - Uses canonical phase-geometry + phase functions from dayNightVisibility.ts so that sign
//   conventions cannot silently diverge.
//
// IMPORTANT physical meaning of amplitudes (reflAmp/thermAmp/constant):
// - If physicalScaling is enabled (default):
//   * reflAmp is treated like a geometric-albedo-like scale and is multiplied by (R_body / r)^2.
//   * thermAmp and constant are multiplied by (R_body / R_star)^2.
// - If physicalScaling is disabled: amplitudes are interpreted as raw stellar-flux units.
//
// Conventions (consistent with sim.ts):
// - observerDir points from the star toward the observer.
// - rBody is the body position vector in inertial coordinates (star at origin).
// - Secondary eclipse gating (body hidden by star) is not applied here; sim.ts handles that.
//
// Design goals:
// - bodyPhaseFlux(...) is the primary API.
// - planetPhaseFlux(...) is a backwards-compatible wrapper.
// - This file does NOT re-implement phase angle or phase functions; it delegates to dayNightVisibility.ts.

import type { DayNightVisibilityParams, PhaseCurveParams, ThermalModelAdvancedParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { clamp01, isFiniteNumber } from "../core/units";

import type { ReflectedPhaseModel, ThermalPhaseModel } from "./dayNightVisibility";
import {
  applyPhaseOffset,
  reflectedLightGeometricWeight,
  thermalLightGeometricWeight,
} from "./dayNightVisibility";
import { bodyPhaseAlpha, clampWeightsFor, reflectedModelFor, thermalModelFor } from "./phaseCurveGeometry";
import { effectiveThermalInertia, phaseCurvePhysicalScales, thermalAdvancedBoost } from "./phaseCurveScaling";

/**
 * Phase-curve configuration (phenomenological).
 *
 * All flux amplitudes are in stellar baseline units (dimensionless):
 * - reflAmp: reflected-light amplitude knob (no automatic radius/albedo scaling).
 * - thermAmp: thermal emission amplitude knob (no automatic radius/temperature scaling).
 * - constant: additive constant floor in stellar units.
 *
 * Backwards-compatibility:
 * - Fields mirror coretypes.PhaseCurveParams to keep JSON presets stable.
 */
export type PhaseCurveModel = PhaseCurveParams;

export type NormalizedThermalInertia = {
  enabled: boolean;
  albedo: number;
  emissivity: number;
  tauSec: number;
  redistribution: number;
};

export type NormalizedPhaseCurveModel = {
  enabled: boolean;
  reflAmp: number;
  thermAmp: number;
  reflOffset: number;
  thermOffset: number;
  lambertian: boolean;
  constant: number;
  reflModel?: ReflectedPhaseModel;
  thermalModel?: ThermalPhaseModel;
  clamp: boolean;
  physicalScaling: boolean;
  thermalInertia: NormalizedThermalInertia;
};

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function nonNegativeFiniteOrZero(value: number | undefined): number {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function normalizeThermalInertia(
  inertia: PhaseCurveModel["thermalInertia"] | undefined,
): NormalizedThermalInertia {
  return {
    enabled: Boolean(inertia?.enabled),
    albedo: clamp01(finiteOrDefault(inertia?.albedo, 0)),
    emissivity: clamp01(finiteOrDefault(inertia?.emissivity, 1)),
    tauSec: nonNegativeFiniteOrZero(inertia?.thermalTimescaleSec),
    redistribution: clamp01(finiteOrDefault(inertia?.redistribution, 0)),
  };
}

/**
 * Normalized/sanitized PhaseCurveModel used internally.
 * This keeps behavior deterministic and protects against NaNs in user presets.
 */
function normalizePhaseCurveModel(model: PhaseCurveModel | undefined): NormalizedPhaseCurveModel {
  return {
    enabled: Boolean(model?.enabled),
    reflAmp: nonNegativeFiniteOrZero(model?.reflAmp),
    thermAmp: nonNegativeFiniteOrZero(model?.thermAmp),
    reflOffset: finiteOrDefault(model?.reflOffset, 0),
    thermOffset: finiteOrDefault(model?.thermOffset, 0),
    lambertian: Boolean(model?.lambertian),
    constant: nonNegativeFiniteOrZero(model?.constant),
    reflModel: model?.reflModel,
    thermalModel: model?.thermalModel,
    clamp: model?.clamp !== false,
    physicalScaling: model?.physicalScaling !== false,
    thermalInertia: normalizeThermalInertia(model?.thermalInertia),
  };
}

/**
 * Reflected-light contribution (stellar units):
 *   f_refl = reflAmp * Φ(alpha_eff)
 *
 * where Φ is chosen by the reflected phase model and alpha_eff is optionally offset.
 */
function reflectedFluxTerm(params: {
  alpha: number;
  reflAmp: number;
  model: ReflectedPhaseModel;
  reflOffset?: number;
  clamp?: boolean;
}): number {
  const { alpha, reflAmp, model } = params;

  if (!Number.isFinite(alpha)) return 0;
  if (!Number.isFinite(reflAmp) || reflAmp <= 0) return 0;

  const off = isFiniteNumber(params.reflOffset) ? params.reflOffset : 0;
  const aEff = applyPhaseOffset(alpha, -off);

  const w = reflectedLightGeometricWeight(aEff, model);
  const ww = params.clamp === false ? w : clamp01(w);

  return Number.isFinite(ww) ? reflAmp * ww : 0;
}

type ThermalFluxTermParams = {
  alpha: number;
  thermAmp: number;
  model: ThermalPhaseModel;
  thermOffset?: number;
  clamp?: boolean;
  thermalInertia?: NormalizedThermalInertia;
  orbitPeriodSec?: number;
};

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function phaseOffsetOrZero(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 0;
}

function thermalAmplitude(params: ThermalFluxTermParams): number {
  const inertia = params.thermalInertia;
  const thermScale = inertia?.enabled ? inertia.emissivity * (1 - inertia.albedo) : 1;
  return params.thermAmp * thermScale;
}

function phaseWeightWithClamp(alpha: number, model: ThermalPhaseModel, doClamp: boolean): number {
  const w = thermalLightGeometricWeight(alpha, model);
  return doClamp ? clamp01(w) : w;
}

function inertiaResponse(period: number, inertia: NormalizedThermalInertia): { lag: number; gain: number } {
  const x = ((2 * Math.PI) / period) * inertia.tauSec;
  return {
    lag: Math.atan(x),
    gain: 1 / Math.sqrt(1 + x * x),
  };
}

function shouldUseThermalInertia(
  model: ThermalPhaseModel,
  inertia: NormalizedThermalInertia | undefined,
  period: number | undefined,
): period is number {
  return Boolean(
    inertia?.enabled && model !== "constant" && Number.isFinite(period) && (period as number) > 0,
  );
}

function thermalInertiaFluxTerm(
  params: ThermalFluxTermParams,
  amp: number,
  inertia: NormalizedThermalInertia,
  period: number,
): number {
  const { lag, gain } = inertiaResponse(period, inertia);
  const off = phaseOffsetOrZero(params.thermOffset);
  const aEff = applyPhaseOffset(params.alpha, -(off + lag));
  const w = phaseWeightWithClamp(aEff, params.model, params.clamp !== false);
  const wVar = Number.isFinite(w) ? w * gain : 0;
  const wEff = inertia.redistribution + (1 - inertia.redistribution) * wVar;
  const ww = params.clamp === false ? wEff : clamp01(wEff);
  return Number.isFinite(ww) ? amp * ww : 0;
}

function directThermalFluxTerm(params: ThermalFluxTermParams, amp: number): number {
  const aEff = applyPhaseOffset(params.alpha, -phaseOffsetOrZero(params.thermOffset));
  const ww = phaseWeightWithClamp(aEff, params.model, params.clamp !== false);
  return Number.isFinite(ww) ? amp * ww : 0;
}

export type BodyPhaseFluxParams = {
  rBody: Vec3;
  rBodyRadius?: number;
  rStarRadius?: number;
  observerDir: Vec3;
  orbitPeriodSec?: number;
  model?: PhaseCurveModel;
  dayNightVisibility?: DayNightVisibilityParams;
  thermalModelAdvanced?: ThermalModelAdvancedParams;
};

/**
 * Thermal emission contribution (stellar units):
 *   f_therm = thermAmp * W(alpha_eff)
 *
 * - For model="constant", W=1.
 * - Otherwise uses the thermal geometric weight from dayNightVisibility.ts.
 */
function thermalFluxTerm(params: ThermalFluxTermParams): number {
  if (!Number.isFinite(params.alpha)) return 0;
  if (!positiveFinite(params.thermAmp)) return 0;

  const inertia = params.thermalInertia;
  const amp = thermalAmplitude(params);
  if (!positiveFinite(amp)) return 0;
  if (inertia && shouldUseThermalInertia(params.model, inertia, params.orbitPeriodSec)) {
    return thermalInertiaFluxTerm(params, amp, inertia, params.orbitPeriodSec);
  }
  return directThermalFluxTerm(params, amp);
}

/**
 * Primary API: generic body phase-curve contribution (reflection + thermal + constant),
 * in stellar baseline flux units (dimensionless).
 *
 * Intended for sim.ts for both planet and moon.
 */
export function bodyPhaseFlux(params: BodyPhaseFluxParams): number {
  const norm = normalizePhaseCurveModel(params.model);
  if (!norm.enabled) return 0;

  const alpha = bodyPhaseAlpha(params);
  if (alpha === undefined) return 0;
  const dn = params.dayNightVisibility;
  const clampWeights = clampWeightsFor(norm, dn);
  const scales = phaseCurvePhysicalScales(norm, params);

  const refl = reflectedFluxTerm({
    alpha,
    reflAmp: norm.reflAmp * scales.reflScale,
    model: reflectedModelFor(norm, dn),
    reflOffset: norm.reflOffset,
    clamp: clampWeights,
  });

  const therm = thermalFluxTerm({
    alpha,
    thermAmp: norm.thermAmp * scales.thermScale,
    model: thermalModelFor(norm, dn),
    thermOffset: norm.thermOffset,
    clamp: clampWeights,
    thermalInertia: effectiveThermalInertia(norm, params.thermalModelAdvanced),
    orbitPeriodSec: params.orbitPeriodSec,
  });

  const constant = norm.physicalScaling ? norm.constant * scales.thermScale : norm.constant;
  const total = refl + therm * thermalAdvancedBoost(params) + constant;
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}
