// src/physics/frames.ts

import type { Vec3 } from "./vec3";
import { vCross, vDot, vLen, vNormalize } from "./vec3";

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
 * Optional utility: rotation about +Y (sometimes handy for debugging/alternate conventions).
 */
export function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z };
}

/**
 * Convert from perifocal/orbital-plane coordinates (PQW) to inertial coordinates (IJK).
 *
 * Convention: active rotations applied to the vector in the order:
 *   r_IJK = Rz(Ω) * Rx(i) * Rz(ω) * r_PQW
 *
 * Implemented as: apply Rz(ω), then Rx(i), then Rz(Ω).
 */
export function perifocalToInertial(
  rPQW: Vec3,
  Omega: number,
  inc: number,
  omega: number
): Vec3 {
  let v = rotateZ(rPQW, omega);
  v = rotateX(v, inc);
  v = rotateZ(v, Omega);
  return v;
}

/**
 * Inverse of perifocalToInertial for the same active-rotation convention.
 * For rotations, inverse = transpose => negate angles and reverse order.
 */
export function inertialToPerifocal(
  rIJK: Vec3,
  Omega: number,
  inc: number,
  omega: number
): Vec3 {
  let v = rotateZ(rIJK, -Omega);
  v = rotateX(v, -inc);
  v = rotateZ(v, -omega);
  return v;
}

/**
 * Build an orthonormal sky basis from an observer line-of-sight direction.
 *
 * ez points toward the observer (line of sight).
 * ex and ey span the sky plane such that (ex, ey, ez) is right-handed.
 *
 * This allows projectToSky() to work for arbitrary observer directions.
 */
export function buildSkyBasis(observerDir: Vec3): SkyBasis {
  if (!Number.isFinite(observerDir.x) || !Number.isFinite(observerDir.y) || !Number.isFinite(observerDir.z)) {
    throw new Error("buildSkyBasis: observerDir must be finite.");
  }

  const ez = vNormalize(observerDir);
  if (vLen(ez) === 0) {
    throw new Error("buildSkyBasis: observerDir must be non-zero.");
  }

  // Pick a reference vector not (nearly) parallel to ez to avoid degeneracy.
  const ref: Vec3 = Math.abs(ez.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };

  // ex = normalize(ref × ez)
  let ex = vCross(ref, ez);
  if (vLen(ex) < 1e-15) {
    // fallback if ref was accidentally parallel (should be rare)
    ex = vCross({ x: 1, y: 0, z: 0 }, ez);
  }
  ex = vNormalize(ex);

  // ey = ez × ex (ensures right-handed basis)
  const ey = vCross(ez, ex);

  return { ex, ey, ez };
}

/**
 * Projection into the observer's sky plane.
 *
 * Returns:
 * - x,y: coordinates in the sky plane basis (ex, ey)
 * - z: depth along the observer direction (ez)
 *
 * Default convention matches your current simulation: observer looks along +Z.
 */
export function projectToSky(r: Vec3, observerDir: Vec3 = { x: 0, y: 0, z: 1 }): SkyPoint {
  const { ex, ey, ez } = buildSkyBasis(observerDir);
  return {
    x: vDot(r, ex),
    y: vDot(r, ey),
    z: vDot(r, ez),
  };
}
