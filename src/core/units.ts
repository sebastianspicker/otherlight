// src/core/units.ts

// Centralized numeric helpers and angle utilities.
//
// Design goals:
// - Single source of truth for clamp/wrap behavior across the repo.
// - Consistent angle-wrapping domains (wrapTo2Pi, wrapToPi).
// - Unified parsing/sanitization helpers (toFiniteNumber, etc.) so other modules
//   don't re-implement them ad-hoc.
// - Keep this file dependency-free so it can be imported anywhere
//   (core, physics, sim, photometry, render).
//
// Conventions used across the simulation:
// - Angles are radians unless explicitly stated.
// - Time is seconds.
// - Lengths are arbitrary "simulation units" (internally consistent).

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// Canonical names (readable).
export const TWO_PI = 2 * Math.PI;
export const HALF_PI = 0.5 * Math.PI;

// Backwards-compatible aliases (older code often expects these).
// IMPORTANT: These must NOT redeclare the same identifier twice.
export const TWOPI = TWO_PI;
export const HALFPI = HALF_PI;

// Practical upper bound used for UI sanitization (strictly < 1 for elliptic orbits).
export const ECC_MAX = 0.999;

/**
 * Clamp value into [min,max]. Robust even if min/max are swapped.
 * If x is NaN, returns NaN (propagates via Math.min/Math.max).
 */
export function clamp(x: number, a: number, b: number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return Math.max(min, Math.min(max, x));
}

/** Clamp to [0,1]. */
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/**
 * Clamp to [-1,1].
 * Useful before acos() to avoid NaNs from tiny round-off errors.
 */
export function clamp11(x: number): number {
  return clamp(x, -1, 1);
}

/**
 * Linear interpolation.
 * Note: does not clamp t (caller decides).
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Wrap angle to [0, 2π).
 *
 * Guarantees:
 * - Finite input -> output in [0, 2π).
 * - 2π maps to 0 (up to floating error).
 */
export function wrapTo2Pi(rad: number): number {
  if (!Number.isFinite(rad)) return rad;

  // Modulo arithmetic is generally more stable for large angles than
  // iterative subtraction, and handles the wrap-around logic cleanly.
  let x = rad % TWO_PI;

  // Javascript's % operator returns a result with the same sign as the dividend.
  // We want a strictly non-negative result in [0, 2π).
  if (x < 0) {
    x += TWO_PI;
  }

  // Handle tiny floating point errors where x might become exactly 2π after addition
  if (x >= TWO_PI) {
    x = 0;
  }

  return x;
}

/**
 * Wrap angle to (-π, π].
 *
 * Guarantees:
 * - Finite input -> output in (-π, π].
 * - +π stays +π (not -π).
 */
export function wrapToPi(rad: number): number {
  if (!Number.isFinite(rad)) return rad;

  // Shift by +π, wrap to [0,2π), shift back to [-π,π)
  let x = wrapTo2Pi(rad + Math.PI) - Math.PI;

  // Map -π to +π for consistency with (-π, π].
  if (x <= -Math.PI) x = Math.PI;

  return x;
}

/** Convert degrees to radians. */
export function degToRad(deg: number): number {
  return deg * DEG2RAD;
}

/** Convert radians to degrees. */
export function radToDeg(rad: number): number {
  return rad * RAD2DEG;
}

/**
 * Convert unknown input to a finite number, else fallback.
 *
 * Notes:
 * - Accepts numeric strings (via Number(v)).
 * - Treats NaN/±Inf as invalid -> fallback.
 */
export function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Convert unknown input to a finite number, then clamp into [min,max].
 * If conversion fails -> fallback, then clamp.
 */
export function toFiniteClamped(v: unknown, fallback: number, min: number, max: number): number {
  return clamp(toFiniteNumber(v, fallback), min, max);
}

/**
 * Convert unknown input to a finite number, clamped to >= 0.
 * If conversion fails -> fallback, then clamp to >= 0.
 */
export function toFiniteNonNeg(v: unknown, fallback: number): number {
  const x = toFiniteNumber(v, fallback);
  const fb = Number.isFinite(fallback) ? fallback : 0;
  return Number.isFinite(x) ? Math.max(0, x) : Math.max(0, fb);
}

/**
 * Convert unknown input to a finite number; if not strictly > 0, return fallback.
 * Useful for positive-only values where a sensible default is preferred over eps.
 */
export function toFinitePositiveOr(v: unknown, fallback: number): number {
  const fb = toFiniteNumber(fallback, 1e-12);
  const n = toFiniteNumber(v, fb);

  if (Number.isFinite(n) && n > 0) return n;
  return Number.isFinite(fb) && fb > 0 ? fb : 1e-12;
}

/**
 * Convert unknown input to a finite number, clamped to > 0 by epsilon.
 * Useful for dt, tau, denominators, etc.
 */
export function toFinitePos(v: unknown, fallback: number, eps = 1e-12): number {
  const x = toFiniteNumber(v, fallback);
  const fb = Number.isFinite(fallback) ? fallback : eps;
  const val = Number.isFinite(x) ? x : fb;
  return Math.max(eps, val);
}

/**
 * Normalize a "finite difference dt" (seconds) used in numerical derivatives.
 * - Ensures finite and >= 1e-6 seconds to avoid dt=0 degeneracy.
 */
export function normalizeFiniteDiffDtSec(v: unknown, fallback: number): number {
  return toFinitePos(v, fallback, 1e-6);
}

/**
 * Compare two angles a and b by their wrapped signed difference in (-π, π].
 * Useful for "smallest angular separation" calculations.
 */
export function angleDeltaPi(a: number, b: number): number {
  return wrapToPi(a - b);
}

/**
 * Compare two angles a and b by their wrapped difference in [0, 2π).
 * Useful for phase offsets where non-negative differences are desired.
 */
export function angleDelta2Pi(a: number, b: number): number {
  return wrapTo2Pi(a - b);
}

// ---------------------------
// Canonical finite guards
// ---------------------------

/** True iff x is a finite number (rejects NaN and ±Infinity). */
export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** True iff x is finite and strictly > 0. */
export function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

/** True iff x is finite and >= 0. */
export function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}
