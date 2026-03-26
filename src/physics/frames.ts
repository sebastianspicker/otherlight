// src/physics/frames.ts

//
// Frame and rotation utilities.
//
// Scientific convention notes
// ---------------------------
// This module uses active, right-handed rotations (rotating the vector, not the basis).
// The standard orbital-element mapping implemented here is:
//
// r_IJK = Rz(Omega) * Rx(inc) * Rz(omega) * r_PQW
//
// where Omega = RAAN, inc = inclination, omega = argument of periapsis.
//
// Sky projection
// --------------
// buildSkyBasis(observerDir) creates an orthonormal, right-handed basis (ex, ey, ez) where:
// - ez points toward the observer line-of-sight (LOS).
// - ex and ey span the sky plane.
// - (ex, ey, ez) is right-handed.
//
// projectToSky(r, observerDir) returns:
// - x = dot(r, ex), y = dot(r, ey) in the sky plane,
// - z = dot(r, ez) depth along LOS.
//
// Robustness
// ----------
// buildSkyBasis uses a stable fallback strategy to avoid degeneracy when observerDir is nearly
// parallel to a chosen reference axis. This function is the *single source of truth* for
// sky-basis construction in the codebase.

import type { Vec3 } from "./vec3";
import { vCross, vDot, vIsFinite, vLen, vNormalizeOrThrow, vNormalizeOrZero } from "./vec3";

export type SkyPoint = { x: number; y: number; z: number };

export type SkyBasis = {
  ex: Vec3;
  ey: Vec3;
  ez: Vec3;
};

const DEFAULT_OBSERVER_DIR: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Active right-handed rotation of a vector about the Z axis by angle a [rad].
 * Right-hand rule: positive angle rotates X toward Y.
 */
export function rotateZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z };
}

/**
 * Active right-handed rotation of a vector about the X axis by angle a [rad].
 * Right-hand rule: positive angle rotates Y toward Z.
 */
export function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z };
}

/**
 * Optional utility: active right-handed rotation about the Y axis by angle a [rad].
 * Right-hand rule: positive angle rotates Z toward X.
 */
export function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

/**
 * Convert from perifocal/orbital-plane coordinates PQW to inertial coordinates IJK.
 * Active-rotation convention:
 * r_IJK = Rz(Omega) * Rx(inc) * Rz(omega) * r_PQW
 */
export function perifocalToInertial(rPQW: Vec3, Omega: number, inc: number, omega: number): Vec3 {
  let v = rotateZ(rPQW, omega);
  v = rotateX(v, inc);
  v = rotateZ(v, Omega);
  return v;
}

/**
 * Inverse of perifocalToInertial for the same active-rotation convention.
 * For rotations: inverse = transpose => negate angles and reverse order:
 * r_PQW = Rz(-omega) * Rx(-inc) * Rz(-Omega) * r_IJK
 */
/**
 * Pick a stable reference vector not nearly parallel to ez.
 * Strategy:
 * - Choose the axis corresponding to the smallest absolute component of ez.
 * This maximizes cross-product magnitude and improves numerical stability.
 */
function pickReferenceAxisForEz(ez: Vec3): Vec3 {
  const ax = Math.abs(ez.x);
  const ay = Math.abs(ez.y);
  const az = Math.abs(ez.z);

  // If x component is smallest (or tied), use X-axis.
  if (ax <= ay && ax <= az) return { x: 1, y: 0, z: 0 };
  // If y component is smallest (or tied), use Y-axis.
  if (ay <= ax && ay <= az) return { x: 0, y: 1, z: 0 };
  // Otherwise use Z-axis.
  return { x: 0, y: 0, z: 1 };
}

/**
 * Build an orthonormal sky basis from an observer line-of-sight direction.
 * ez points toward the observer line of sight.
 * ex and ey span the sky plane such that (ex, ey, ez) is right-handed.
 *
 * This function is intended to be the canonical basis builder used everywhere.
 */
export function buildSkyBasis(observerDir: Vec3): SkyBasis {
  if (!vIsFinite(observerDir)) throw new Error("buildSkyBasis: observerDir must be finite.");

  // Require a non-zero LOS direction.
  const ez = vNormalizeOrThrow(observerDir, 1e-15, "buildSkyBasis: observerDir must be non-zero.");

  // Choose a robust reference axis and compute ex = normalize(ref × ez).
  const ref = pickReferenceAxisForEz(ez);

  // If ez is exactly parallel to ref (rare but possible with ties), cross will be zero.
  // Fall back deterministically to another axis.
  let exRaw = vCross(ref, ez);
  let ex = vNormalizeOrZero(exRaw, 1e-15);

  if (vLen(ex) === 0) {
    const ref2: Vec3 = ref.x === 1 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    exRaw = vCross(ref2, ez);
    ex = vNormalizeOrThrow(exRaw, 1e-15, "buildSkyBasis: failed to construct ex (degenerate observerDir).");
  }

  // ey = normalize(ez × ex) ensures right-handedness and orthogonality by construction.
  const ey = vNormalizeOrThrow(vCross(ez, ex), 1e-15, "buildSkyBasis: failed to construct ey.");

  return { ex, ey, ez };
}

/**
 * Projection into the observer's sky plane.
 * Returns:
 * - x,y coordinates in the sky-plane basis (ex, ey)
 * - z depth along the observer direction ez
 *
 * Default convention: observer looks along +Z.
 */
export function projectToSky(r: Vec3, observerDir: Vec3 = DEFAULT_OBSERVER_DIR): SkyPoint {
  const { ex, ey, ez } = buildSkyBasis(observerDir);
  return { x: vDot(r, ex), y: vDot(r, ey), z: vDot(r, ez) };
}

/**
 * Project using a precomputed sky basis.
 * Useful when projecting many points against the same observer direction.
 */
export function projectToSkyWithBasis(r: Vec3, basis: SkyBasis): SkyPoint {
  return {
    x: vDot(r, basis.ex),
    y: vDot(r, basis.ey),
    z: vDot(r, basis.ez),
  };
}
