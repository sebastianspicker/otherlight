// src/photometry/dayNightVisibility.ts

//
// Day/Night (terminator) visibility utilities for reflected/emitted light.
//
// GOAL (canonical geometry source):
// - Single canonical source for:
//   - phase angle definition alpha,
//   - Lambert and cosine phase laws,
//   - illuminated visible area fraction,
//   - thermal visibility weights (simple geometric policies),
//   - model-selection glue used by phaseCurve.ts and sim.ts.
//
// Canonical phase geometry (repo-wide):
// - Star is at origin.
// - Body has inertial position rBody (vector from star -> body).
// - observerDir points from the star toward the observer (observer at infinity).
//
// Phase angle alpha definition (MUST match phaseCurve.ts expectations):
// - sHat = unit vector from body -> star = normalize(-rBody)
// - oHat = unit vector from body -> observer ≈ normalize(observerDir)
// - cos(alpha) = sHat · oHat
// - alpha = acos(cos(alpha)) in [0, pi]
//
// Interpretation:
// - alpha = 0   full phase (dayside facing observer; maximal reflected light)
// - alpha = pi  new phase  (nightside facing observer; minimal reflected light)
//
// Robustness:
// - Finite checks on vectors.
// - Normalization guards against zero vectors.
// - Dot products clamped to [-1,1] to keep acos safe.
// - Outputs clamped to valid ranges.

import type { Vec3 } from "../physics/vec3";
import { vDot, vIsFinite, vNormalizeOrThrow } from "../physics/vec3";

export type ReflectedPhaseModel = "lambert" | "cosine";

/**
 * Thermal geometric visibility model.
 * - "constant": isotropic emission / no phase dependence (geometry weight = 1).
 * - "cosine"  : simple dayside-bright / nightside-dark toy model.
 * - "lambert" : sometimes used as a smoother alternative (still a toy for thermal).
 */
export type ThermalPhaseModel = "constant" | ReflectedPhaseModel;

/** Clamp x into [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Clamp x into [-1,1]. */
function clamp11(x: number): number {
  return clamp(x, -1, 1);
}

/** Clamp x into [0,1]. */
function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/**
 * Compute the canonical phase angle alpha in [0, pi] for a body at position rBody (star at origin),
 * given observerDir (direction from star to observer).
 *
 * CONTRACT / POLICY:
 * - No other module is allowed to define its own "alpha" (phase-angle) convention.
 * - All phase-angle computations MUST call phaseAngleRadFromBodyPos(...) from this file to avoid
 *   sign/geometry drift (observerDir convention, star/body vectors, and acos clamping policy).
 *
 * Returns alpha [rad] where:
 * - alpha = 0  => full phase
 * - alpha = pi => new phase
 */
export function phaseAngleRadFromBodyPos(rBody: Vec3, observerDir: Vec3): number {
  if (!vIsFinite(rBody)) throw new Error("phaseAngleRadFromBodyPos: rBody must be finite.");
  if (!vIsFinite(observerDir)) throw new Error("phaseAngleRadFromBodyPos: observerDir must be finite.");

  // Direction from body -> star.
  const sHat = vNormalizeOrThrow(
    { x: -rBody.x, y: -rBody.y, z: -rBody.z },
    1e-15,
    "phaseAngleRadFromBodyPos: rBody must be non-zero."
  );

  // Direction from body -> observer (observer at infinity): ~observerDir.
  const oHat = vNormalizeOrThrow(
    observerDir,
    1e-15,
    "phaseAngleRadFromBodyPos: observerDir must be non-zero."
  );

  const cosAlpha = clamp11(vDot(sHat, oHat));
  return Math.acos(cosAlpha);
}

/**
 * Lambert phase function Phi(alpha), disk-integrated reflected-light law for a Lambertian sphere.
 *
 * Closed form:
 *   Phi(alpha) = [sin(alpha) + (pi - alpha) cos(alpha)] / pi
 *
 * Properties:
 * - Phi(0) = 1
 * - Phi(pi) = 0
 * - Smooth and monotone decreasing on [0, pi]
 */
export function lambertPhaseFunction(alphaRad: number): number {
  const a = clamp(alphaRad, 0, Math.PI);
  const s = Math.sin(a);
  const c = Math.cos(a);
  const phi = (s + (Math.PI - a) * c) / Math.PI;
  return clamp01(phi);
}

/**
 * Cosine phase approximation:
 *   Phi_cos(alpha) = (1 + cos(alpha)) / 2
 *
 * Note:
 * - This equals the illuminated fraction of the *visible disk area* for a sphere.
 * - It does not include Lambertian surface-brightness weighting across the disk.
 */
export function cosinePhaseFunction(alphaRad: number): number {
  const a = clamp(alphaRad, 0, Math.PI);
  return clamp01((1 + Math.cos(a)) / 2);
}

/**
 * Illuminated fraction of the *visible disk area* (pure geometry, no intensity weighting):
 *   f_area(alpha) = (1 + cos(alpha)) / 2
 *
 * This is identical to cosinePhaseFunction(alpha).
 */
export function illuminatedVisibleAreaFraction(alphaRad: number): number {
  return cosinePhaseFunction(alphaRad);
}

/**
 * Reflected-light geometric weight from alpha and model choice.
 * Caller typically multiplies this by reflAmp and additional scaling in phaseCurve.ts.
 */
export function reflectedLightGeometricWeight(alphaRad: number, model: ReflectedPhaseModel): number {
  return model === "lambert" ? lambertPhaseFunction(alphaRad) : cosinePhaseFunction(alphaRad);
}

/**
 * Reflected-light geometric weight from body position.
 * Convenient entry-point to avoid duplicating alpha conventions.
 */
export function reflectedLightWeightFromBodyPos(params: {
  rBody: Vec3;
  observerDir: Vec3;
  model?: ReflectedPhaseModel;
}): number {
  const model = params.model ?? "lambert";
  const alpha = phaseAngleRadFromBodyPos(params.rBody, params.observerDir);
  return reflectedLightGeometricWeight(alpha, model);
}

/**
 * Thermal visibility geometric weight (simple policies).
 *
 * Scientific intent:
 * - "constant": isotropic thermal emission (no phase dependence).
 * - "cosine"/"lambert": toy dayside-weighted emission.
 */
export function thermalLightGeometricWeight(alphaRad: number, model: ThermalPhaseModel): number {
  if (model === "constant") return 1.0;
  return reflectedLightGeometricWeight(alphaRad, model);
}

/**
 * Thermal visibility geometric weight from body position.
 * Kept here so phaseCurve.ts does not re-implement alpha conventions.
 */
export function thermalLightWeightFromBodyPos(params: {
  rBody: Vec3;
  observerDir: Vec3;
  model?: ThermalPhaseModel;
}): number {
  const model = params.model ?? "constant";
  const alpha = phaseAngleRadFromBodyPos(params.rBody, params.observerDir);
  return thermalLightGeometricWeight(alpha, model);
}

/**
 * Utility: apply an optional phase offset (radians) to alpha and clamp into [0, pi].
 *
 * NOTE:
 * - Offsetting alpha is a toy model; physically, hotspot offsets are longitudinal and should be applied
 *   through a more explicit geometry. This helper exists for backwards-compatible phenomenology.
 */
export function applyPhaseOffset(alphaRad: number, offsetRad: number): number {
  const a = clamp(alphaRad, 0, Math.PI);
  if (!Number.isFinite(offsetRad) || offsetRad === 0) return a;

  // Shift then clamp back into [0, pi] (no periodic continuation in alpha beyond [0,pi] is physical).
  return clamp(a + offsetRad, 0, Math.PI);
}

/**
 * Compute geometric visibility factors for reflected and thermal light based on phase angle.
 * Added for compatibility with other modules expecting a unified calculator.
 */
export function computeDayNightVisibility(
  alphaRad: number,
  reflModel: ReflectedPhaseModel = "lambert",
  thermModel: ThermalPhaseModel = "constant"
): { reflected: number; thermal: number } {
  const reflected = reflectedLightGeometricWeight(alphaRad, reflModel);
  const thermal = thermalLightGeometricWeight(alphaRad, thermModel);
  return { reflected, thermal };
}

// ---------------------------
// Minimal built-in tests
// ---------------------------
// These tests are dependency-free and only run if runDayNightVisibilitySelfTests() is called.
// They mainly guard against sign-convention divergence and ensure basic endpoint properties.

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`dayNightVisibility self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

function in01(x: number): boolean {
  return Number.isFinite(x) && x >= -1e-12 && x <= 1 + 1e-12;
}

/**
 * Self-tests:
 * - Endpoint checks for Lambert/cosine.
 * - Canonical alpha geometry sanity:
 *   If rBody is +z and observerDir is +z, then sHat = -z, oHat=+z => alpha=pi (new phase).
 *   If rBody is -z and observerDir is +z, then sHat = +z, oHat=+z => alpha=0 (full phase).
 *
 * This matches the repo’s convention observerDir points star->observer.
 */
export function runDayNightVisibilitySelfTests(): void {
  // Phase function endpoints:
  assert(approxEq(lambertPhaseFunction(0), 1, 1e-12), "Lambert Phi(0) must be 1.");
  assert(approxEq(lambertPhaseFunction(Math.PI), 0, 1e-12), "Lambert Phi(pi) must be 0.");
  assert(approxEq(cosinePhaseFunction(0), 1, 1e-12), "Cosine Phi(0) must be 1.");
  assert(approxEq(cosinePhaseFunction(Math.PI), 0, 1e-12), "Cosine Phi(pi) must be 0.");

  // Range:
  assert(in01(lambertPhaseFunction(0.7)), "Lambert must be in [0,1].");
  assert(in01(cosinePhaseFunction(0.7)), "Cosine must be in [0,1].");

  // Canonical geometry sanity against sign flips:
  const observerDir = { x: 0, y: 0, z: 1 };

  const alphaNew = phaseAngleRadFromBodyPos({ x: 0, y: 0, z: 10 }, observerDir);
  assert(approxEq(alphaNew, Math.PI, 1e-12), "rBody=+z with observerDir=+z must give alpha=pi (new phase).");

  const alphaFull = phaseAngleRadFromBodyPos({ x: 0, y: 0, z: -10 }, observerDir);
  assert(approxEq(alphaFull, 0, 1e-12), "rBody=-z with observerDir=+z must give alpha=0 (full phase).");
}
