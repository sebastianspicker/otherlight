// src/physics/vec3.ts

export type Vec3 = { x: number; y: number; z: number };

export const VEC3_ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function vIsFinite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
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

export function vNormalize(v: Vec3, eps = 1e-15): Vec3 {
  const L = vLen(v);
  if (!Number.isFinite(L) || L < eps) return { x: 0, y: 0, z: 0 };
  return vScale(v, 1 / L);
}

export function vNormalizeOrThrow(v: Vec3, eps = 1e-15, msg = "vNormalizeOrThrow: vector length too small"): Vec3 {
  const L = vLen(v);
  if (!Number.isFinite(L) || L < eps) throw new Error(msg);
  return vScale(v, 1 / L);
}

export function vNearlyZero(v: Vec3, eps = 1e-15): boolean {
  return vLenSq(v) < eps * eps;
}

export function vClampLen(v: Vec3, maxLen: number, eps = 1e-15): Vec3 {
  if (!Number.isFinite(maxLen) || maxLen < 0) {
    throw new Error("vClampLen: maxLen must be a finite number >= 0.");
  }
  const L = vLen(v);
  if (!Number.isFinite(L) || L < eps) return { x: 0, y: 0, z: 0 };
  if (L <= maxLen) return v;
  return vScale(v, maxLen / L);
}
