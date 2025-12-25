// src/physics/vec3.ts
//
// Minimal, dependency-free 3D vector utilities used across physics, photometry, simulation, and render.
//
// Goals:
// - Provide a complete set of commonly used operations to avoid ad-hoc re-implementations.
// - Enforce a consistent numerical robustness policy for normalization:
//   - vNormalizeOrZero(): returns zero vector if length is too small / non-finite.
//   - vNormalizeOrThrow(): throws if length is too small / non-finite.
// - Keep functions side-effect free (no mutation of input vectors).
//
// Conventions:
// - Vec3 is plain-data for easy serialization and debugging.
// - No units are assumed; the caller’s coordinate system defines meaning.

export type Vec3 = { x: number; y: number; z: number };

/** Canonical zero vector constant. Treat as immutable. */
export const VEC3_ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** Construct a Vec3. */
export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** Type guard-ish finite check. */
export function vIsFinite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Strict finiteness assertion with a helpful message. */
export function vAssertFinite(v: Vec3, name = "v"): void {
  if (!vIsFinite(v)) throw new Error(`${name} must be finite (got x=${v.x}, y=${v.y}, z=${v.z}).`);
}

/** Exact equality (mostly useful for tests). */
export function vEq(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Component-wise approximate equality. */
export function vApproxEq(a: Vec3, b: Vec3, eps = 1e-12): boolean {
  if (!Number.isFinite(eps) || eps < 0) throw new Error("vApproxEq: eps must be a finite number >= 0.");
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps
  );
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vNeg(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
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

/**
 * a*s + b*t
 * Useful for weighted sums, barycenter computations, etc.
 */
export function vLinComb(a: Vec3, s: number, b: Vec3, t: number): Vec3 {
  return { x: a.x * s + b.x * t, y: a.y * s + b.y * t, z: a.z * s + b.z * t };
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
  return Math.hypot(v.x, v.y, v.z);
}

export function vDistSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function vDist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Return a unit vector in the direction of v, or the zero vector if v is too small/non-finite.
 *
 * Policy:
 * - If length is non-finite or < eps -> return (0,0,0).
 * - Otherwise return v / |v|.
 *
 * Use this when "best-effort" behavior is desired without throwing.
 */
export function vNormalizeOrZero(v: Vec3, eps = 1e-15): Vec3 {
  const L = vLen(v);
  if (!Number.isFinite(L) || L < eps) return VEC3_ZERO;
  return vScale(v, 1 / L);
}

/**
 * Return a unit vector in the direction of v, or throw if v is too small/non-finite.
 *
 * Policy:
 * - If length is non-finite or < eps -> throw Error(msg).
 * - Otherwise return v / |v|.
 *
 * Use this when a valid non-zero direction is required (e.g. observer direction).
 */
export function vNormalizeOrThrow(
  v: Vec3,
  eps = 1e-15,
  msg = "vNormalizeOrThrow: vector length too small"
): Vec3 {
  const L = vLen(v);
  if (!Number.isFinite(L) || L < eps) throw new Error(msg);
  return vScale(v, 1 / L);
}

/**
 * Backwards compatible alias for earlier code that used vNormalize().
 * Kept to avoid breaking existing imports/call-sites.
 *
 * Note:
 * - This function matches the old behavior: normalize-or-zero.
 * - Prefer vNormalizeOrZero / vNormalizeOrThrow in new code for clarity.
 */
export function vNormalize(v: Vec3, eps = 1e-15): Vec3 {
  return vNormalizeOrZero(v, eps);
}

/** True if ||v|| < eps (using squared length). */
export function vNearlyZero(v: Vec3, eps = 1e-15): boolean {
  if (!Number.isFinite(eps) || eps < 0) throw new Error("vNearlyZero: eps must be a finite number >= 0.");
  return vLenSq(v) < eps * eps;
}

/**
 * Clamp vector length to <= maxLen.
 *
 * If v is tiny/non-finite -> return zero.
 * If maxLen is 0 -> returns zero (unless v is NaN -> still returns zero via L check).
 */
export function vClampLen(v: Vec3, maxLen: number, eps = 1e-15): Vec3 {
  if (!Number.isFinite(maxLen) || maxLen < 0) {
    throw new Error("vClampLen: maxLen must be a finite number >= 0.");
  }
  const L = vLen(v);
  if (!Number.isFinite(L) || L < eps) return VEC3_ZERO;
  if (L <= maxLen) return v;
  return vScale(v, maxLen / L);
}

/**
 * Project v onto the direction of n (not necessarily unit).
 * Returns zero if n is too small/non-finite.
 */
export function vProjectOnto(v: Vec3, n: Vec3, eps = 1e-15): Vec3 {
  const nn = vLenSq(n);
  if (!Number.isFinite(nn) || nn < eps * eps) return VEC3_ZERO;
  const s = vDot(v, n) / nn;
  return vScale(n, s);
}

/**
 * Reject v from the direction of n: v - proj_n(v).
 * Returns v if n is too small/non-finite.
 */
export function vRejectFrom(v: Vec3, n: Vec3, eps = 1e-15): Vec3 {
  const nn = vLenSq(n);
  if (!Number.isFinite(nn) || nn < eps * eps) return v;
  const s = vDot(v, n) / nn;
  return vAddScaled(v, n, -s);
}

/**
 * Angle between vectors in [0, π].
 * Returns NaN if either vector is non-finite or too small.
 */
export function vAngle(a: Vec3, b: Vec3, eps = 1e-15): number {
  const la = vLen(a);
  const lb = vLen(b);
  if (!Number.isFinite(la) || !Number.isFinite(lb) || la < eps || lb < eps) return NaN;
  let c = vDot(a, b) / (la * lb);
  // Clamp for numerical safety.
  if (c > 1) c = 1;
  if (c < -1) c = -1;
  return Math.acos(c);
}

/**
 * Returns a unit vector orthogonal to v (arbitrary but deterministic),
 * or zero if v is too small/non-finite.
 *
 * This is occasionally useful for building frames/bases.
 */
export function vAnyOrthogonalUnit(v: Vec3, eps = 1e-15): Vec3 {
  const u = vNormalizeOrZero(v, eps);
  if (vEq(u, VEC3_ZERO)) return VEC3_ZERO;

  // Choose a helper axis least aligned with u to avoid degeneracy.
  const ax = Math.abs(u.x);
  const ay = Math.abs(u.y);
  const az = Math.abs(u.z);

  const helper: Vec3 =
    az < 0.9 ? { x: 0, y: 0, z: 1 } :
    ay < 0.9 ? { x: 0, y: 1, z: 0 } :
               { x: 1, y: 0, z: 0 };

  return vNormalizeOrZero(vCross(u, helper), eps);
}
