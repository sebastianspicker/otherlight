// src/photometry/phaseCurve.ts
//
// Reflection + thermal emission phase-curve utilities.
//
// Scientific scope (intentionally simple, robust, and simulator-friendly):
// - Computes an additive body flux contribution (reflection + thermal + constant floor) in
//   **stellar baseline flux units** (dimensionless), suitable for adding to a normalized stellar flux. 
// - Uses the canonical phase-geometry and phase functions (alpha/Lambert/cosine/thermal weights)
//   from dayNightVisibility.ts so that sign conventions cannot silently diverge. 
//
// IMPORTANT physical meaning of amplitudes (reflAmp/thermAmp/constant):
// - reflAmp and thermAmp are purely phenomenological scaling knobs in *stellar flux units*. 
// - No automatic scaling by body radius, albedo, phase integral, emissivity, distance, etc. is applied here. 
// - If physically motivated scaling is desired, it must be encoded by the caller when choosing reflAmp/thermAmp. 
//
// Conventions (consistent with sim.ts):
// - observerDir points from the star toward the observer. 
// - rBody (rPlanet/rMoon) is the body position vector in inertial coordinates (star at origin). 
// - Secondary eclipse gating (body hidden by star) is not applied here; sim.ts has sky-plane information and
//   already gates additive flux when behind the star. 
//
// Design goals / repo-state:
// - bodyPhaseFlux(...) is the primary API.
// - planetPhaseFlux(...) remains as a backwards-compatible wrapper (same signature).
// - This file intentionally does NOT re-implement alpha/Lambert/cosine; it delegates to dayNightVisibility.ts. 

import type { Vec3 } from "../physics/vec3"; // 
import { vIsFinite } from "../physics/vec3"; // 
import { clamp01 } from "../core/units"; // 

import type { ReflectedPhaseModel, ThermalPhaseModel } from "./dayNightVisibility";
import {
  applyPhaseOffset,
  phaseAngleRadFromBodyPos,
  reflectedLightGeometricWeight,
  thermalLightGeometricWeight,
} from "./dayNightVisibility";

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

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
export type PhaseCurveModel = {
  enabled?: boolean;

  reflAmp?: number;
  thermAmp?: number;

  reflOffset?: number; // radians (phenomenological)
  thermOffset?: number; // radians (phenomenological)

  // Legacy toggle preserved:
  lambertian?: boolean;

  // Optional constant nightside / floor term (stellar units).
  constant?: number;

  // Explicit model selections (override legacy lambertian when present).
  reflModel?: ReflectedPhaseModel;
  thermalModel?: ThermalPhaseModel;

  /**
   * If true, clamp derived geometric weights into [0,1] (recommended default for robustness).
   * Note: amplitudes are still applied multiplicatively afterwards.
   */
  clamp?: boolean;
};

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
  };
}

/**
 * Reflected-light contribution (stellar units):
 *   f_refl = reflAmp * Φ(alpha_eff)
 *
 * where Φ is chosen by the reflected phase model (Lambert or cosine) and alpha_eff is optionally offset.
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
 * - Otherwise uses the same geometric weight family as reflected light (toy but explicit).
 */
export function thermalFluxTerm(params: {
  alpha: number;
  thermAmp: number;
  model: ThermalPhaseModel;
  thermOffset?: number;
  clamp?: boolean;
}): number {
  const { alpha, thermAmp, model } = params;

  if (!Number.isFinite(alpha)) return 0;
  if (!Number.isFinite(thermAmp) || thermAmp <= 0) return 0;

  const off = isFiniteNumber(params.thermOffset) ? params.thermOffset : 0;
  const aEff = applyPhaseOffset(alpha, -off);

  const w = thermalLightGeometricWeight(aEff, model);
  const ww = params.clamp === false ? w : clamp01(w);

  return Number.isFinite(ww) ? thermAmp * ww : 0;
}

/**
 * Primary API: generic body phase-curve contribution (reflection + thermal + constant),
 * in stellar baseline flux units (dimensionless). 
 *
 * This function should be used by sim.ts for both planet and moon. 
 */
export function bodyPhaseFlux(params: { rBody: Vec3; observerDir: Vec3; model?: PhaseCurveModel }): number {
  const norm = normalizePhaseCurveModel(params.model);
  if (!norm.enabled) return 0;

  // Keep robustness: return 0 if geometry is invalid.
  if (!vIsFinite(params.rBody) || !vIsFinite(params.observerDir)) return 0;

  // Canonical alpha from dayNightVisibility.ts (single source of truth). 
  const alpha = phaseAngleRadFromBodyPos(params.rBody, params.observerDir);
  if (!Number.isFinite(alpha)) return 0;

  // Choose reflected model:
  // - reflModel overrides legacy lambertian
  // - else legacy: lambertian ? "lambert" : "cosine"
  const reflModel: ReflectedPhaseModel = (norm.reflModel ?? (norm.lambertian ? "lambert" : "cosine")) as ReflectedPhaseModel;

  // Choose thermal model:
  // - If omitted, keep legacy behavior as a cosine-like dayside visibility (matches older “0.5*(1+cos)” default).
  const thermalModel: ThermalPhaseModel = (norm.thermalModel ?? "cosine") as ThermalPhaseModel;

  const refl = reflectedFluxTerm({
    alpha,
    reflAmp: norm.reflAmp,
    model: reflModel,
    reflOffset: norm.reflOffset,
    clamp: norm.clamp,
  });

  const therm = thermalFluxTerm({
    alpha,
    thermAmp: norm.thermAmp,
    model: thermalModel,
    thermOffset: norm.thermOffset,
    clamp: norm.clamp,
  });

  const total = refl + therm + norm.constant;

  // Enforce non-negativity (physical for these toy additive terms).
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

/**
 * Backwards-compatible wrapper: existing call sites can keep using planetPhaseFlux(...). 
 */
export function planetPhaseFlux(params: { rPlanet: Vec3; observerDir: Vec3; model?: PhaseCurveModel }): number {
  return bodyPhaseFlux({ rBody: params.rPlanet, observerDir: params.observerDir, model: params.model });
}

// ---------------------------
// Minimal built-in tests
// ---------------------------
//
// These tests are dependency-free and only run if runPhaseCurveSelfTests() is called.
// They primarily ensure the code path uses dayNightVisibility alpha/weights consistently.

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`phaseCurve self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

export function runPhaseCurveSelfTests(): void {
  const observerDir = { x: 0, y: 0, z: 1 };

  // alpha sanity (delegated to dayNightVisibility; this guards accidental re-introduction of a local convention):
  const alphaFull = phaseAngleRadFromBodyPos({ x: 0, y: 0, z: -10 }, observerDir);
  const alphaNew = phaseAngleRadFromBodyPos({ x: 0, y: 0, z: 10 }, observerDir);
  assert(approxEq(alphaFull, 0, 1e-12), "alpha(full) should be 0 for rBody=-z with observerDir=+z.");
  assert(approxEq(alphaNew, Math.PI, 1e-12), "alpha(new) should be pi for rBody=+z with observerDir=+z.");

  // bodyPhaseFlux basic behavior: non-negative and scales with amps.
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
