// src/core/units.ts
//
// Centralized numeric helpers and angle utilities.
// Conventions used across the simulation:
// - All angles in code are radians unless explicitly stated.
// - Time is seconds (handled in sim.ts via period [s]).
// - Lengths are arbitrary "simulation units" (internally consistent).
//
// Keep this file dependency-free so it can be imported anywhere (physics, sim, render).

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export const TWO_PI = 2 * Math.PI;
export const HALF_PI = 0.5 * Math.PI;

/**
 * Clamp value into [min,max]. Robust even if min/max are swapped.
 * If x is NaN, returns NaN (fail-fast propagation).
 */
export function clamp(x: number, a: number, b: number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return Math.max(min, Math.min(max, x));
}

/**
 * Clamp to [0,1].
 */
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Wrap angle to [0, 2π).
 * Useful when you want a monotonically increasing phase representation.
 */
export function wrapTo2Pi(rad: number): number {
  if (!Number.isFinite(rad)) return rad;
  rad = rad - TWO_PI * Math.floor(rad / TWO_PI);
  // ensure 2π maps to 0
  if (rad >= TWO_PI) rad -= TWO_PI;
  return rad;
}

/**
 * Wrap angle to (-π, π].
 * This is convenient for Newton solvers and "small angle" comparisons.
 */
export function wrapToPi(rad: number): number {
  if (!Number.isFinite(rad)) return rad;
  // Shift by +π, wrap to [0,2π), shift back to (-π,π]
  rad = wrapTo2Pi(rad + Math.PI) - Math.PI;

  // Ensure +π stays +π (not -π) for consistency.
  // Floating edge cases: if rad is extremely close to -π, map to +π.
  if (rad <= -Math.PI) rad = Math.PI;
  return rad;
}

/**
 * Convert degrees to radians.
 */
export function degToRad(deg: number): number {
  return deg * DEG2RAD;
}

/**
 * Convert radians to degrees.
 */
export function radToDeg(rad: number): number {
  return rad * RAD2DEG;
}
