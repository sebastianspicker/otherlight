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

import type { DayNightVisibilityParams, PhaseCurveParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { vIsFinite, vLen } from "../physics/vec3";
import { clamp01, isFiniteNumber } from "../core/units";

import type { ReflectedPhaseModel, ThermalPhaseModel } from "./dayNightVisibility";
import {
  applyPhaseOffset,
  phaseAngleRadFromBodyPos,
  reflectedLightGeometricWeight,
  thermalLightGeometricWeight,
} from "./dayNightVisibility";

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

/**
 * Normalized/sanitized PhaseCurveModel used internally.
 * This keeps behavior deterministic and protects against NaNs in user presets.
 */
export function normalizePhaseCurveModel(model: PhaseCurveModel | undefined): {
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
  thermalInertia: {
    enabled: boolean;
    albedo: number;
    emissivity: number;
    tauSec: number;
    redistribution: number;
  };
} {
  const enabled = Boolean(model?.enabled);

  const reflAmp = isFiniteNumber(model?.reflAmp) ? Math.max(0, model!.reflAmp as number) : 0;
  const thermAmp = isFiniteNumber(model?.thermAmp) ? Math.max(0, model!.thermAmp as number) : 0;

  const reflOffset = isFiniteNumber(model?.reflOffset) ? (model!.reflOffset as number) : 0;
  const thermOffset = isFiniteNumber(model?.thermOffset) ? (model!.thermOffset as number) : 0;

  const lambertian = Boolean(model?.lambertian);

  const constant = isFiniteNumber(model?.constant) ? Math.max(0, model!.constant as number) : 0;

  const reflModel = model?.reflModel;
  const thermalModel = model?.thermalModel;

  const clamp = model?.clamp !== false;
  const physicalScaling = model?.physicalScaling !== false;

  const inertia = model?.thermalInertia;
  const thermalInertia = {
    enabled: Boolean(inertia?.enabled),
    albedo: clamp01(isFiniteNumber(inertia?.albedo) ? (inertia!.albedo as number) : 0),
    emissivity: clamp01(isFiniteNumber(inertia?.emissivity) ? (inertia!.emissivity as number) : 1),
    tauSec: isFiniteNumber(inertia?.thermalTimescaleSec)
      ? Math.max(0, inertia!.thermalTimescaleSec as number)
      : 0,
    redistribution: clamp01(isFiniteNumber(inertia?.redistribution) ? (inertia!.redistribution as number) : 0),
  };

  return {
    enabled,
    reflAmp,
    thermAmp,
    reflOffset,
    thermOffset,
    lambertian,
    constant,
    reflModel,
    thermalModel,
    clamp,
    physicalScaling,
    thermalInertia,
  };
}

/**
 * Reflected-light contribution (stellar units):
 *   f_refl = reflAmp * Φ(alpha_eff)
 *
 * where Φ is chosen by the reflected phase model and alpha_eff is optionally offset.
 */
export function reflectedFluxTerm(params: {
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

/**
 * Thermal emission contribution (stellar units):
 *   f_therm = thermAmp * W(alpha_eff)
 *
 * - For model="constant", W=1.
 * - Otherwise uses the thermal geometric weight from dayNightVisibility.ts.
 */
export function thermalFluxTerm(params: {
  alpha: number;
  thermAmp: number;
  model: ThermalPhaseModel;
  thermOffset?: number;
  clamp?: boolean;
  thermalInertia?: {
    enabled: boolean;
    albedo: number;
    emissivity: number;
    tauSec: number;
    redistribution: number;
  };
  orbitPeriodSec?: number;
}): number {
  const { alpha, thermAmp, model } = params;

  if (!Number.isFinite(alpha)) return 0;
  if (!Number.isFinite(thermAmp) || thermAmp <= 0) return 0;

  const off = isFiniteNumber(params.thermOffset) ? params.thermOffset : 0;
  const inertia = params.thermalInertia;
  const albedo = inertia ? inertia.albedo : 0;
  const emissivity = inertia ? inertia.emissivity : 1;
  const thermScale = emissivity * (1 - albedo);

  const amp = thermAmp * thermScale;
  if (!(Number.isFinite(amp) && amp > 0)) return 0;

  if (inertia?.enabled && model !== "constant") {
    const period = params.orbitPeriodSec;
    if (Number.isFinite(period) && period > 0) {
      const omega = (2 * Math.PI) / period;
      const x = omega * inertia.tauSec;
      const lag = Math.atan(x);
      const gain = 1 / Math.sqrt(1 + x * x);

      const aEff = applyPhaseOffset(alpha, -(off + lag));
      const wRaw = thermalLightGeometricWeight(aEff, model);
      const w = params.clamp === false ? wRaw : clamp01(wRaw);

      const wVar = Number.isFinite(w) ? w * gain : 0;
      const r = inertia.redistribution;
      const wEff = r + (1 - r) * wVar;
      const ww = params.clamp === false ? wEff : clamp01(wEff);

      return Number.isFinite(ww) ? amp * ww : 0;
    }
  }

  const aEff = applyPhaseOffset(alpha, -off);

  const w = thermalLightGeometricWeight(aEff, model);
  const ww = params.clamp === false ? w : clamp01(w);

  return Number.isFinite(ww) ? amp * ww : 0;
}

/**
 * Primary API: generic body phase-curve contribution (reflection + thermal + constant),
 * in stellar baseline flux units (dimensionless).
 *
 * Intended for sim.ts for both planet and moon.
 */
export function bodyPhaseFlux(params: {
  rBody: Vec3;
  rBodyRadius?: number;
  rStarRadius?: number;
  observerDir: Vec3;
  orbitPeriodSec?: number;
  model?: PhaseCurveModel;
  dayNightVisibility?: DayNightVisibilityParams;
}): number {
  const norm = normalizePhaseCurveModel(params.model);
  if (!norm.enabled) return 0;

  // Robustness: return 0 if geometry is invalid.
  if (!vIsFinite(params.rBody) || !vIsFinite(params.observerDir)) return 0;

  // Canonical alpha from dayNightVisibility.ts (single source of truth).
  const alpha = phaseAngleRadFromBodyPos(params.rBody, params.observerDir);
  if (!Number.isFinite(alpha)) return 0;

  const dn = params.dayNightVisibility;
  const dnEnabled = Boolean(dn?.enabled);

  // Choose reflected model:
  // - dayNightVisibility overrides if enabled
  // - else reflModel overrides legacy lambertian
  // - else legacy: lambertian ? "lambert" : "cosine"
  const reflModel: ReflectedPhaseModel = (dnEnabled
    ? dn?.reflectedModel ?? "lambert"
    : norm.reflModel ?? (norm.lambertian ? "lambert" : "cosine")) as ReflectedPhaseModel;

  // Choose thermal model:
  // - dayNightVisibility overrides if enabled
  // - else model override or legacy default: cosine
  const thermalModel: ThermalPhaseModel = (dnEnabled
    ? dn?.thermalModel ?? "constant"
    : norm.thermalModel ?? "cosine") as ThermalPhaseModel;

  // Clamp policy for geometric weights.
  const clampWeights = dnEnabled ? dn?.clamp !== false : norm.clamp;

  // Optional physical scaling.
  let reflScale = 1;
  let thermScale = 1;
  if (norm.physicalScaling) {
    const rBodyRadius = params.rBodyRadius;
    const rStarRadius = params.rStarRadius;
    const r = vLen(params.rBody);

    if (!(Number.isFinite(rBodyRadius) && rBodyRadius > 0)) {
      // If radii are missing, fall back to the legacy unscaled behavior.
      reflScale = 1;
      thermScale = 1;
    } else {
      reflScale = r > 0 ? (rBodyRadius * rBodyRadius) / (r * r) : 0;
      thermScale =
        Number.isFinite(rStarRadius) && rStarRadius! > 0
          ? (rBodyRadius * rBodyRadius) / (rStarRadius! * rStarRadius!)
          : 1;
    }
  }

  const refl = reflectedFluxTerm({
    alpha,
    reflAmp: norm.reflAmp * reflScale,
    model: reflModel,
    reflOffset: norm.reflOffset,
    clamp: clampWeights,
  });

  const therm = thermalFluxTerm({
    alpha,
    thermAmp: norm.thermAmp * thermScale,
    model: thermalModel,
    thermOffset: norm.thermOffset,
    clamp: clampWeights,
    thermalInertia: norm.thermalInertia,
    orbitPeriodSec: params.orbitPeriodSec,
  });

  const constant = norm.physicalScaling ? norm.constant * thermScale : norm.constant;
  const total = refl + therm + constant;

  // Enforce non-negativity (physical for these toy additive terms).
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

/** Backwards-compatible wrapper: existing call sites can keep using planetPhaseFlux(...). */
export function planetPhaseFlux(params: {
  rPlanet: Vec3;
  observerDir: Vec3;
  model?: PhaseCurveModel;
}): number {
  return bodyPhaseFlux({
    rBody: params.rPlanet,
    observerDir: params.observerDir,
    model: params.model,
  });
}

// ---------------------------
// Minimal built-in tests
// ---------------------------

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`phaseCurve self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Self-tests (dependency-free, only run if called):
 * - Ensures alpha convention matches dayNightVisibility.
 * - Ensures bodyPhaseFlux is non-negative and scales with amplitudes.
 */
export function runPhaseCurveSelfTests(): void {
  const observerDir = { x: 0, y: 0, z: 1 };

  const alphaFull = phaseAngleRadFromBodyPos(
    { x: 0, y: 0, z: -10 },
    observerDir
  );
  const alphaNew = phaseAngleRadFromBodyPos(
    { x: 0, y: 0, z: 10 },
    observerDir
  );

  assert(
    approxEq(alphaFull, 0, 1e-12),
    "alpha(full) should be 0 for rBody=-z with observerDir=+z."
  );
  assert(
    approxEq(alphaNew, Math.PI, 1e-12),
    "alpha(new) should be pi for rBody=+z with observerDir=+z."
  );

  const f0 = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 },
    observerDir,
    model: { enabled: true, reflAmp: 0, thermAmp: 0, constant: 0 },
  });
  assert(approxEq(f0, 0), "Zero amps must yield zero flux.");

  const f1 = bodyPhaseFlux({
    rBody: { x: 0, y: 0, z: -10 }, // full phase => weight ~1
    observerDir,
    model: { enabled: true, reflAmp: 1e-3, thermAmp: 0, lambertian: true },
  });
  assert(f1 > 0, "Positive reflAmp at full phase should yield positive flux.");
}
