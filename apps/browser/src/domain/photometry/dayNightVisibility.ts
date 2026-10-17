/** Provides canonical day-night geometry and phase visibility calculations. */

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

import { clamp, clamp01, clamp11, isFinitePositive } from "../model/units";
import type { Vec3 } from "../orbits/vec3";
import { vAddScaled, vDot, vIsFinite, vLen, vNormalizeOrThrow, vNormalizeOrZero } from "../orbits/vec3";

export type ReflectedPhaseModel = "lambert" | "cosine";

/**
 * Thermal geometric visibility model.
 * - "constant": isotropic emission / no phase dependence (geometry weight = 1).
 * - "cosine"  : simple dayside-bright / nightside-dark toy model.
 * - "lambert" : sometimes used as a smoother alternative (still a toy for thermal).
 */
export type ThermalPhaseModel = "constant" | ReflectedPhaseModel;

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
    "phaseAngleRadFromBodyPos: rBody must be non-zero.",
  );

  // Direction from body -> observer (observer at infinity): ~observerDir.
  const oHat = vNormalizeOrThrow(
    observerDir,
    1e-15,
    "phaseAngleRadFromBodyPos: observerDir must be non-zero.",
  );

  const cosAlpha = clamp11(vDot(sHat, oHat));
  return Math.acos(cosAlpha);
}

export function transitCenteredPhaseRadFromBodyPos(rBody: Vec3, observerDir: Vec3): number {
  try {
    return Math.PI - phaseAngleRadFromBodyPos(rBody, observerDir);
  } catch {
    // Fail-open: a zero-length or non-finite body or observer vector has no phase; treat it as
    // transit centre. Validated scenarios never reach this (positions and observerDir are finite, non-zero).
    return 0;
  }
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
function lambertPhaseFunction(alphaRad: number): number {
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
function cosinePhaseFunction(alphaRad: number): number {
  const a = clamp(alphaRad, 0, Math.PI);
  return clamp01((1 + Math.cos(a)) / 2);
}

/**
 * Reflected-light geometric weight from alpha and model choice.
 * Caller typically multiplies this by reflAmp and additional scaling in phaseCurve.ts.
 */
export function reflectedLightGeometricWeight(alphaRad: number, model: ReflectedPhaseModel): number {
  return model === "lambert" ? lambertPhaseFunction(alphaRad) : cosinePhaseFunction(alphaRad);
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
 * Legacy velocity-normalized beaming phase psi in (-pi, pi], from the body's position
 * rRel and velocity vRel relative to its star (observerDir points from the star toward the observer):
 *   z = (rRel . oHat) / |rRel|,  s = -(vRel . oHat) / vNorm,  psi = atan2(s, z)
 * For eccentric motion this legacy velocity-phase surrogate is not geometric conjunction.
 * - sin(psi) > 0 while the body recedes from the observer, i.e. while the star approaches.
 * vNorm defaults to |vRel| (exact for circular orbits). Returns undefined for degenerate input.
 */
export function signedConjunctionPhaseRad(
  rRel: Vec3,
  vRel: Vec3,
  observerDir: Vec3,
  vNorm?: number,
): number | undefined {
  if (!vIsFinite(rRel) || !vIsFinite(vRel) || !vIsFinite(observerDir)) return undefined;
  const oHat = vNormalizeOrZero(observerDir);
  const rLen = vLen(rRel);
  const norm = isFinitePositive(vNorm) ? vNorm : vLen(vRel);
  if (!(rLen > 1e-15 && norm > 0 && vLen(oHat) > 0)) return undefined;
  const psi = Math.atan2(-vDot(vRel, oHat) / norm, vDot(rRel, oHat) / rLen);
  return Number.isFinite(psi) ? psi : undefined;
}

/** Returns conjunction phase from position and the radial-free orbital tangent. */
export function geometricConjunctionPhaseRad(rRel: Vec3, vRel: Vec3, observerDir: Vec3): number | undefined {
  if (!vIsFinite(rRel) || !vIsFinite(vRel) || !vIsFinite(observerDir)) return undefined;
  const oHat = vNormalizeOrZero(observerDir);
  const rLen = vLen(rRel);
  if (!(rLen > 1e-15 && vLen(oHat) > 0)) return undefined;
  const rHat = vNormalizeOrZero(rRel);
  const tangent = vAddScaled(vRel, rHat, -vDot(vRel, rHat));
  const norm = vLen(tangent);
  if (!(norm > 0)) return undefined;
  const cosine = vDot(rHat, oHat);
  const sine = -vDot(tangent, oHat) / norm;
  if (Math.hypot(cosine, sine) < 1e-12) return undefined;
  const psi = Math.atan2(sine, cosine);
  return Number.isFinite(psi) ? psi : undefined;
}

/**
 * Phase angle alpha_eff in [0, pi] of a body whose bright region is shifted by shiftRad along its
 * orbit: the body position is rotated by -shiftRad about the orbit normal (rBody x vBody) before the
 * canonical phase angle is taken. For an edge-on circular orbit this equals |wrap(psi - pi - shift)|,
 * so a positive shift (hotspot offset or thermal lag) moves the peak after superior conjunction.
 * shiftRad = 0 reproduces phaseAngleRadFromBodyPos. Returns undefined when rBody and vBody are
 * degenerate (zero or parallel), so callers can fall back to applyPhaseOffset.
 */
export function shiftedPhaseAngleRad(
  rBody: Vec3,
  vBody: Vec3,
  observerDir: Vec3,
  shiftRad: number,
): number | undefined {
  if (!vIsFinite(rBody) || !vIsFinite(vBody) || !vIsFinite(observerDir)) return undefined;
  if (!Number.isFinite(shiftRad)) return undefined;
  const rHat = vNormalizeOrZero(rBody);
  const vPerp = vAddScaled(vBody, rHat, -vDot(vBody, rHat));
  const oHat = vNormalizeOrZero(observerDir);
  if (vLen(rHat) === 0 || vLen(oHat) === 0 || !(vLen(vPerp) > 1e-9 * vLen(vBody))) return undefined;
  const tHat = vNormalizeOrZero(vPerp);
  const cosAlpha = -vDot(rHat, oHat) * Math.cos(shiftRad) + vDot(tHat, oHat) * Math.sin(shiftRad);
  return Math.acos(clamp11(cosAlpha));
}
