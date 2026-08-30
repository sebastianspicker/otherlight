/** Centralizes SI constants, unit conversions, and finite-value guards. */

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
// - Lengths are meters (SI).

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// SI constants and conversions (centralized)
// ---------------------------------------------------------------------------
// References (classification is stated for each value):
// - G: CODATA 2022 recommended value (measured, not exact).
// - AU: IAU 2012 definition.
// - Solar radius: exact IAU 2015 nominal conversion constant.
// - Solar mass in kg: conventional measured reference value, not an exact IAU
//   nominal constant. IAU 2015 B3 defines the nominal solar mass parameter GM.

/** Gravitational constant G in m^3 kg^-1 s^-2 (2022 CODATA: 6.67430(15)e-11). */
export const G_SI = 6.6743e-11;

/** Astronomical Unit in meters (IAU 2012). */
export const AU_M = 149_597_870_700;

/** Julian day in seconds. */
export const DAY_S = 86_400;

/** Julian year in seconds (365.25 days). */
export const JULIAN_YEAR_S = 365.25 * DAY_S;

/** Conventional solar-mass estimate in kg; measured/rounded, not exact or IAU nominal. */
export const SOLAR_MASS_KG = 1.98847e30;

/** Exact nominal solar-radius conversion constant in meters (IAU 2015). */
export const SOLAR_RADIUS_M = 6.957e8;

/** Conventional Earth-mass estimate in kg; measured/rounded, not exact or IAU nominal. */
export const EARTH_MASS_KG = 5.9722e24;

/** Conventional mean Earth radius in meters; rounded, not an IAU nominal equatorial radius. */
export const EARTH_RADIUS_M = 6.371e6;

/** Conventional Jupiter-mass estimate in kg; measured/rounded, not exact or IAU nominal. */
export const JUPITER_MASS_KG = 1.89813e27;

/** Conventional mean Jupiter radius in meters; rounded, not an IAU nominal equatorial radius. */
export const JUPITER_RADIUS_M = 6.9911e7;

export function auToM(au: number): number {
  return au * AU_M;
}

export function mToAu(m: number): number {
  return m / AU_M;
}

export function dayToSec(days: number): number {
  return days * DAY_S;
}

export function secToDay(sec: number): number {
  return sec / DAY_S;
}

export function yearToSec(years: number): number {
  return years * JULIAN_YEAR_S;
}

export function secToYear(sec: number): number {
  return sec / JULIAN_YEAR_S;
}

export function solarMassToKg(mSolar: number): number {
  return mSolar * SOLAR_MASS_KG;
}

export function kgToSolarMass(kg: number): number {
  return kg / SOLAR_MASS_KG;
}

// Canonical names (readable).
export const TWO_PI = 2 * Math.PI;

// Practical upper bound used for UI sanitization (strictly < 1 for elliptic orbits).
export const ECC_MAX = 0.999;

/**
 * Clamp value into [min,max]. Robust even if min/max are swapped.
 * If x is not finite (NaN/±Inf), returns min (the safe lower bound) to avoid propagating
 * non-finite values. This is intentional fail-safe behavior: NaN silently maps to the
 * lower bound rather than propagating, which prevents downstream NaN cascades in the simulation.
 */
export function clamp(x: number, a: number, b: number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (!Number.isFinite(x)) return min;
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
 * - Accepts non-empty numeric strings.
 * - Treats NaN/±Inf as invalid -> fallback.
 */
export function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Convert unknown input to a finite number, clamped to >= 0.
 * If conversion fails -> fallback, then clamp to >= 0.
 */
export function toFiniteNonNeg(v: unknown, fallback: number): number {
  const x = toFiniteNumber(v, fallback);
  const fb = Number.isFinite(fallback) ? fallback : 0;
  const result = Number.isFinite(x) ? Math.max(0, x) : Math.max(0, fb);
  // Final guard: if both v and fallback were NaN, result would be NaN. Guarantee >= 0 contract.
  return Number.isFinite(result) ? result : 0;
}

/**
 * Convert unknown input to a finite number; if not strictly > 0, return fallback.
 * Useful for positive-only values where a sensible default is preferred over eps.
 *
 * **Implicit fallback:** When both `v` and `fallback` are non-finite or <= 0,
 * the function returns `1e-12` as a last-resort positive value to satisfy the
 * "always positive" contract.
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
