// src/physics/vec3.ts
//
// Minimal, dependency-free 3D vector utilities used across physics, photometry,
// simulation, and render.
//
// Goals
// - Provide a small but complete set of common operations (avoid ad-hoc copies).
// - Enforce a consistent numerical robustness policy for normalization:
//   - vNormalizeOrZero(): returns the canonical zero vector if too small / non-finite.
//   - vNormalizeOrThrow(): throws if too small / non-finite.
// - Side-effect free: never mutate input vectors.
//
// Conventions
// - Vec3 is plain-data.
// - No units are assumed.

export type Vec3 = { x: number; y: number; z: number };

/** Canonical zero vector constant. Treat as immutable. */
export const VEC3ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 }) as Vec3;

/** Construct a Vec3. */
export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** True iff all components are finite (rejects NaN and ±Infinity). */
export function vIsFinite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * v + u*s
 * Frequently needed for barycentric splits, integrators, and linear algebra.
 */
export function vAddScaled(v: Vec3, u: Vec3, s: number): Vec3 {
  return { x: v.x + u.x * s, y: v.y + u.y * s, z: v.z + u.z * s };
}

export function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vCross(a: Vec3, b: Vec3): Vec3 {
  // Right-handed cross product a × b:
  // (a2 b3 - a3 b2, a3 b1 - a1 b3, a1 b2 - a2 b1)
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vLenSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vLen(v: Vec3): number {
  // hypot() is robust and avoids some overflow/underflow pitfalls vs manual sqrt(x*x+...).
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Return a unit vector in the direction of v, or the zero vector if v is too small/non-finite.
 *
 * Policy:
 * - If length is non-finite or < eps -> return (0,0,0).
 * - Otherwise return v / |v|.
 */
export function vNormalizeOrZero(v: Vec3, eps = 1e-15): Vec3 {
  if (!Number.isFinite(eps) || eps < 0) {
    throw new Error("vNormalizeOrZero: eps must be a finite number >= 0.");
  }

  // Use squared length to avoid an unnecessary sqrt on the reject path.
  const L2 = vLenSq(v);
  const eps2 = eps * eps;

  if (!Number.isFinite(L2) || L2 < eps2) return VEC3ZERO;

  const invL = 1 / Math.sqrt(L2);
  // Guard against rare overflow/underflow edge cases.
  if (!Number.isFinite(invL)) return VEC3ZERO;

  return vScale(v, invL);
}

/**
 * Return a unit vector in the direction of v, or throw if v is too small/non-finite.
 */
export function vNormalizeOrThrow(
  v: Vec3,
  eps = 1e-15,
  msg = "vNormalizeOrThrow: vector length too small",
): Vec3 {
  if (!Number.isFinite(eps) || eps < 0) {
    throw new Error("vNormalizeOrThrow: eps must be a finite number >= 0.");
  }

  const L2 = vLenSq(v);
  const eps2 = eps * eps;

  if (!Number.isFinite(L2) || L2 < eps2) throw new Error(msg);

  const invL = 1 / Math.sqrt(L2);
  if (!Number.isFinite(invL)) throw new Error(msg);

  return vScale(v, invL);
}

/** True if ||v|| < eps (using squared length). */
export function vNearlyZero(v: Vec3, eps = 1e-15): boolean {
  if (!Number.isFinite(eps) || eps < 0) {
    throw new Error("vNearlyZero: eps must be a finite number >= 0.");
  }
  return vLenSq(v) < eps * eps;
}
