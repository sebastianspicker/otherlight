// src/photometry/occulterCircle.ts
//
// Single-source utilities for circular, opaque occulters used by the transit photometry modules.
//
// Motivation
// - Multiple transit modules often re-implemented the same helpers (sanitization, "full coverage",
//   grid resolution clamping). Those copies can diverge and may accidentally gain early-return bugs.
// - This file provides one canonical definition of:
//   - CircleOcculter (dx, dy, r)
//   - sanitizeCircleOcculters(...)
//   - anyCircleOcculterFullyCoversStar(...)
//   - clampGridRes(...)
//
// Scientific / geometric conventions (must match integrators)
// - Coordinates are in the sky plane, star centered at (0,0).
// - Occulters are opaque circles with center offset (dx,dy) and radius r in the same length units.
// - Tangency is measure-zero for the integral: if d >= rStar + rOcc, treat as no overlap (reject).
// - Full stellar coverage by an occulter occurs when the stellar disk is fully contained in the occulter disk:
//   rOcc >= rStar AND d <= rOcc - rStar.
//
// Design constraints
// - No imports from other photometry modules to avoid circular dependencies.
// - Helpers are deterministic, allocation-light, and side-effect free.
// - Prefer conservative "fail open" behavior for invalid inputs (e.g. return empty list / false).

import { isFiniteNumber, isFinitePositive } from "../core/units";

/** A circular opaque occulter in the sky plane (legacy planet/moon disk). */
export type CircleOcculter = {
  /** Optional discriminant for mixed-shape occulter lists. */
  kind?: "circle";

  /** Sky-plane x offset of occulter center relative to star center. */
  dx: number;

  /** Sky-plane y offset of occulter center relative to star center. */
  dy: number;

  /** Occulter radius (must be finite and > 0). */
  r: number;
};

/**
 * Point-in-circle test for occulter geometry (strict: tangency is NOT blocked).
 */
export function pointInCircleOcculter(x: number, y: number, o: CircleOcculter): boolean {
  const dx = x - o.dx;
  const dy = y - o.dy;
  const r2 = o.r * o.r;
  return dx * dx + dy * dy < r2;
}

/**
 * Clamp a "grid resolution" input used by disk integrators.
 *
 * Interpretation:
 * - gridRes ~ number of samples across the stellar diameter (roughly ny; nx often equals ny).
 *
 * Policy:
 * - Non-finite values fall back to `fallback`.
 * - Returned value is floored to an integer.
 * - Returned value is clamped to [minRes, maxRes] for robustness and to protect runtime.
 * - Absolute minimum resolution is enforced to be 1 to avoid empty loops.
 *
 * Defaults:
 * - minRes=60 matches common integrator defaults in this codebase.
 * - maxRes=4096 is a safe upper cap for runtime/memory protection.
 */
export function clampGridRes(
  raw: unknown,
  fallback: number,
  opts: { minRes?: number; maxRes?: number } = {}
): number {
  const minResRaw = opts.minRes;
  const maxResRaw = opts.maxRes;

  // Enforce hard floor of 1 to prevent gridRes=0 logic errors.
  const minRes = isFinitePositive(minResRaw) ? Math.max(1, Math.floor(minResRaw)) : 60;
  const maxRes = isFinitePositive(maxResRaw) ? Math.max(minRes, Math.floor(maxResRaw)) : 4096;

  // Ensure bounds are sane even if caller provided inverted values.
  const lo = Math.min(minRes, maxRes);
  const hi = Math.max(minRes, maxRes);

  const base = isFiniteNumber(raw) ? raw : Number(raw);
  const v = Number.isFinite(base) ? base : fallback;

  const floored = Math.floor(v);
  const safe = Number.isFinite(floored) ? floored : Math.floor(fallback);

  // If fallback is also bad, guarantee a sane result.
  const safe2 = Number.isFinite(safe) ? safe : lo;

  return Math.max(lo, Math.min(hi, safe2));
}

/**
 * Filter occulters to those that are valid and can overlap the stellar disk in projection.
 *
 * Rules:
 * - Occulter must be a non-null object with finite dx, dy and finite r > 0.
 * - Quick reject if it cannot overlap the star disk: d >= rStar + rOcc (tangency included).
 *
 * Notes:
 * - Does not reorder occulters.
 * - Does not deduplicate overlaps; union logic is handled by the transit integrators.
 */
export function sanitizeCircleOcculters(
  rStar: number,
  occulters?: readonly CircleOcculter[]
): CircleOcculter[] {
  const out: CircleOcculter[] = [];

  if (!isFinitePositive(rStar)) return out;
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    if (!o) continue;

    // dx/dy must be finite. r must be finite and strictly positive.
    if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy) || !isFinitePositive(o.r)) continue;

    const d = Math.hypot(o.dx, o.dy);
    // Math.hypot guarantees non-negative finite result if inputs are finite.
    // Check isFinite just to be extremely defensive.
    if (!Number.isFinite(d)) continue;

    // Tangency (d = rStar + rOcc) is measure-zero -> treat as no overlap (flux not reduced).
    if (d >= rStar + o.r) continue;

    out.push(o);
  }

  return out;
}

/**
 * Returns true if any occulter completely covers the stellar disk in projection.
 *
 * Condition:
 * - rOcc >= rStar AND d <= rOcc - rStar
 *
 * Edge cases:
 * - If inputs are not finite/positive, returns false ("cannot prove full cover").
 */
export function anyCircleOcculterFullyCoversStar(
  rStar: number,
  occulters?: readonly CircleOcculter[]
): boolean {
  if (!isFinitePositive(rStar)) return false;
  if (!Array.isArray(occulters) || occulters.length === 0) return false;

  for (const o of occulters) {
    if (!o) continue;
    if (!isFiniteNumber(o.dx) || !isFiniteNumber(o.dy) || !isFinitePositive(o.r)) continue;

    // If the occulter is smaller than the star, it cannot fully cover it.
    if (o.r < rStar) continue;

    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;

    // Full coverage includes tangency at the containment boundary (d == rOcc - rStar).
    // The occulter covers the star if the furthest point of the star (d + rStar) is within rOcc.
    if (d <= o.r - rStar) return true;
  }

  return false;
}
