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

/** Exact equality (mostly useful for tests). */
function vEq(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Component-wise approximate equality. */
function vApproxEq(a: Vec3, b: Vec3, eps = 1e-12): boolean {
  if (!Number.isFinite(eps) || eps < 0) {
    throw new Error("vApproxEq: eps must be a finite number >= 0.");
  }
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;
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

/**
 * Returns a unit vector orthogonal to v (arbitrary but deterministic),
 * or zero if v is too small/non-finite.
 */
function vAnyOrthogonalUnit(v: Vec3, eps = 1e-15): Vec3 {
  const u = vNormalizeOrZero(v, eps);
  if (vEq(u, VEC3ZERO)) return VEC3ZERO;

  // Pick helper axis least aligned with u (maximizes cross-product magnitude).
  const ax = Math.abs(u.x);
  const ay = Math.abs(u.y);
  const az = Math.abs(u.z);

  const helper: Vec3 =
    ax <= ay && ax <= az ? { x: 1, y: 0, z: 0 } : ay <= az ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };

  return vNormalizeOrZero(vCross(u, helper), eps);
}

/* -----------------------------
 * Minimal built-in tests
 * ----------------------------- */

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`vec3 self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

export function runVec3SelfTests(): void {
  const ex = v3(1, 0, 0);
  const ey = v3(0, 1, 0);
  const ez = v3(0, 0, 1);

  const c = vCross(ex, ey);
  assert(vApproxEq(c, ez, 1e-12), "cross product should be right-handed.");

  const n = vNormalizeOrThrow(v3(3, 0, 0));
  assert(vApproxEq(n, ex, 1e-12), "normalize should produce unit axis.");

  const o = vAnyOrthogonalUnit(ex);
  assert(approxEq(vDot(o, ex), 0, 1e-12), "orthogonal unit should be perpendicular.");
  assert(approxEq(vLen(o), 1, 1e-12), "orthogonal unit should be normalized.");
}
