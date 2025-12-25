// src/physics/frames.ts
//
// Frame and rotation utilities.
//
// Scientific / convention notes
// ----------------------------
// This module uses **active**, right-handed rotations (rotating the vector, not the basis).
// The standard orbital-element mapping implemented here is:
//
//   r_IJK = Rz(Ω) * Rx(i) * Rz(ω) * r_PQW
//
// where:
// - Ω (Omega) is the longitude of the ascending node (RAAN)
// - i (inc) is inclination
// - ω (omega) is argument of periapsis
// - r_PQW is in the perifocal/orbital plane with P along periapsis, Q 90° ahead,
//   and W along angular momentum.
//
// This is the common textbook convention for PQW->IJK using active rotations.
//
// Sky projection
// --------------
// buildSkyBasis(observerDir) creates an orthonormal, right-handed basis (ex, ey, ez) where:
// - ez points toward the observer (line-of-sight, LOS).
// - ex and ey span the sky plane.
// - (ex, ey, ez) is right-handed.
//
// projectToSky(r, observerDir) returns:
// - x = dot(r, ex), y = dot(r, ey) in the sky plane,
// - z = dot(r, ez) depth along LOS.
//
// Consistency tests (should hold exactly or to floating tolerance):
// - If observerDir = (0,0,1), then projectToSky({x,y,z}) -> {x,y,z}.
// - ex·ey≈0, ex·ez≈0, ey·ez≈0; ||ex||≈||ey||≈||ez||≈1; and ex×ey points along +ez.
//
// Robustness
// ----------
// buildSkyBasis uses a stable fallback strategy to avoid degeneracy when observerDir is nearly
// parallel to a chosen reference axis.

import type { Vec3 } from "./vec3";
import { vCross, vDot, vLen, vNormalizeOrThrow, vNormalizeOrZero, vIsFinite } from "./vec3";

export type SkyPoint = { x: number; y: number; z: number };
export type SkyBasis = { ex: Vec3; ey: Vec3; ez: Vec3 };

/**
 * Active right-handed rotation of a vector about the +Z axis by angle a (radians).
 * Right-hand rule: positive angle rotates +X toward +Y.
 */
export function rotateZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y, z: v.z };
}

/**
 * Active right-handed rotation of a vector about the +X axis by angle a (radians).
 * Right-hand rule: positive angle rotates +Y toward +Z.
 */
export function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z };
}

/**
 * Optional utility: active rotation about +Y (sometimes handy for debugging/alternate conventions).
 * Right-hand rule: positive angle rotates +Z toward +X.
 */
export function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

/**
 * Convert from perifocal/orbital-plane coordinates (PQW) to inertial coordinates (IJK).
 *
 * Active-rotation convention:
 *   r_IJK = Rz(Ω) * Rx(i) * Rz(ω) * r_PQW
 *
 * Implemented as: apply Rz(ω), then Rx(i), then Rz(Ω).
 */
export function perifocalToInertial(rPQW: Vec3, Omega: number, inc: number, omega: number): Vec3 {
  let v = rotateZ(rPQW, omega);
  v = rotateX(v, inc);
  v = rotateZ(v, Omega);
  return v;
}

/**
 * Inverse of perifocalToInertial for the same active-rotation convention.
 *
 * For rotations, inverse = transpose => negate angles and reverse order:
 *   r_PQW = Rz(-ω) * Rx(-i) * Rz(-Ω) * r_IJK
 */
export function inertialToPerifocal(rIJK: Vec3, Omega: number, inc: number, omega: number): Vec3 {
  let v = rotateZ(rIJK, -Omega);
  v = rotateX(v, -inc);
  v = rotateZ(v, -omega);
  return v;
}

/**
 * Pick a stable reference vector not nearly parallel to ez.
 *
 * Rationale:
 * - ex is computed from cross(ref, ez).
 * - If ref is too aligned with ez, the cross product is near-zero and unstable.
 *
 * Strategy:
 * - Choose the axis corresponding to the smallest |component| of ez.
 *   This maximizes cross-product magnitude and improves numerical stability.
 */
function pickReferenceAxisForEz(ez: Vec3): Vec3 {
  const ax = Math.abs(ez.x);
  const ay = Math.abs(ez.y);
  const az = Math.abs(ez.z);

  // Choose the axis least aligned with ez.
  if (ax <= ay && ax <= az) return { x: 1, y: 0, z: 0 };
  if (ay <= ax && ay <= az) return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

/**
 * Build an orthonormal sky basis from an observer line-of-sight direction.
 *
 * ez points toward the observer (line of sight).
 * ex and ey span the sky plane such that (ex, ey, ez) is right-handed.
 */
export function buildSkyBasis(observerDir: Vec3): SkyBasis {
  if (!vIsFinite(observerDir)) throw new Error("buildSkyBasis: observerDir must be finite.");

  // Require a non-zero LOS direction.
  const ez = vNormalizeOrThrow(observerDir, 1e-15, "buildSkyBasis: observerDir must be non-zero.");

  // Choose a robust reference axis and compute ex = normalize(ref × ez).
  const ref = pickReferenceAxisForEz(ez);

  // If ez is exactly parallel to ref (rare given the selection rule but possible with ties),
  // cross will be zero; fall back to another axis deterministically.
  let exRaw = vCross(ref, ez);
  let ex = vNormalizeOrZero(exRaw, 1e-15);

  if (vLen(ex) === 0) {
    // Deterministic fallback: try a different axis.
    const ref2 = ref.x === 1 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    exRaw = vCross(ref2, ez);
    ex = vNormalizeOrThrow(exRaw, 1e-15, "buildSkyBasis: failed to construct ex (degenerate observerDir).");
  }

  // ey = ez × ex ensures right-handedness and orthogonality by construction.
  // Normalize ey to protect against tiny drift if ex was produced by normalize-or-zero path.
  const ey = vNormalizeOrThrow(vCross(ez, ex), 1e-15, "buildSkyBasis: failed to construct ey.");

  return { ex, ey, ez };
}

/**
 * Projection into the observer's sky plane.
 *
 * Returns:
 * - x,y: coordinates in the sky plane basis (ex, ey)
 * - z: depth along the observer direction (ez)
 *
 * Default convention matches the simulation: observer looks along +Z.
 *
 * Test case:
 * - With observerDir=(0,0,1), basis becomes ex=(1,0,0), ey=(0,1,0), ez=(0,0,1),
 *   so projectToSky({x,y,z}) returns {x,y,z}.
 */
export function projectToSky(r: Vec3, observerDir: Vec3 = { x: 0, y: 0, z: 1 }): SkyPoint {
  const { ex, ey, ez } = buildSkyBasis(observerDir);
  return {
    x: vDot(r, ex),
    y: vDot(r, ey),
    z: vDot(r, ez),
  };
}

/**
 * Optional debug/self-test helper (does not run automatically).
 * Useful for unit tests without a test framework.
 */
export function _framesSelfTest(): void {
  // 1) Identity projection for default observerDir
  const p = { x: 3.5, y: -2, z: 7 };
  const sky = projectToSky(p, { x: 0, y: 0, z: 1 });
  if (Math.abs(sky.x - p.x) > 1e-12 || Math.abs(sky.y - p.y) > 1e-12 || Math.abs(sky.z - p.z) > 1e-12) {
    throw new Error("_framesSelfTest: projectToSky identity test failed.");
  }

  // 2) Orthonormal + right-handed test for a generic direction
  const { ex, ey, ez } = buildSkyBasis({ x: 1, y: 2, z: 3 });

  const dotXY = vDot(ex, ey);
  const dotXZ = vDot(ex, ez);
  const dotYZ = vDot(ey, ez);
  const lx = vLen(ex);
  const ly = vLen(ey);
  const lz = vLen(ez);

  if (Math.abs(dotXY) > 1e-10 || Math.abs(dotXZ) > 1e-10 || Math.abs(dotYZ) > 1e-10) {
    throw new Error("_framesSelfTest: basis is not orthogonal.");
  }
  if (Math.abs(lx - 1) > 1e-10 || Math.abs(ly - 1) > 1e-10 || Math.abs(lz - 1) > 1e-10) {
    throw new Error("_framesSelfTest: basis vectors are not unit length.");
  }

  // Right-handed: ex × ey should align with +ez
  const rhs = vCross(ex, ey);
  const align = vDot(rhs, ez);
  if (!(align > 0.999999999)) {
    throw new Error("_framesSelfTest: basis is not right-handed.");
  }
}
