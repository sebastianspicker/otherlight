// src/photometry/mutualEvents.ts
//
// Mutual-event utilities for two luminous/opaque disks in the sky plane.
//
// Purpose in this codebase:
// - Stellar transit photometry already handles multiple occulters as a union over the star disk.
// - Mutual events (moon in front of planet / planet in front of moon) primarily matter for
//   planetary/lunar self-flux terms (phase curves, thermal emission).
// - This module provides robust geometry for scaling an object's additive flux by the fraction of
//   its projected disk that remains visible when another disk occults it.
//
// Model (minimal but geometrically correct):
// - Both bodies are modeled as opaque circles on the sky plane.
// - Visible fraction of a target disk:
//     f_visible = 1 - A_overlap / (π R_target^2)
//
// Z-order / depth convention (CRITICAL):
// - sim.ts assumes: larger z = closer to the observer for projectToSky output.
// - visibleFractionWhenOcculted uses the same rule: occulter blocks target only if occulterSky.z > targetSky.z.
//
// Robustness:
// - Numerically stable circle intersection area formula with clamped acos arguments.
// - Guards against tiny negative values in the sqrt term due to rounding.
// - Invalid inputs return safe defaults (mostly 0 overlap / 1 visible).
//
// Compatibility:
// - Existing exports keep names and behavior; helper aliases are provided.

import { clamp, clamp01, isFinitePositive } from "../core/units";

export type SkyPoint3 = { x: number; y: number; z: number };

/** Safe acos with clamped argument for numeric stability near tangency. */
function safeAcos(x: number): number {
  return Math.acos(clamp(x, -1, 1));
}

function validCircleIntersectionInputs(d: number, r1: number, r2: number): boolean {
  if (!Number.isFinite(d) || !Number.isFinite(r1) || !Number.isFinite(r2)) return false;
  return d >= 0 && r1 > 0 && r2 > 0;
}

function sortedRadii(r1: number, r2: number): { R: number; r: number } {
  return { R: Math.max(r1, r2), r: Math.min(r1, r2) };
}

function partialCircleIntersectionArea(d: number, R: number, r: number): number {
  const dSq = d * d;
  const RSq = R * R;
  const rSq = r * r;
  const alpha = safeAcos((dSq + RSq - rSq) / (2 * d * R));
  const beta = safeAcos((dSq + rSq - RSq) / (2 * d * r));
  const part3Arg = (-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r);
  return RSq * alpha + rSq * beta - 0.5 * Math.sqrt(Math.max(0, part3Arg));
}

/**
 * Area of intersection between two circles of radii r1 and r2 separated by distance d.
 *
 * Robust for edge cases:
 * - Non-finite inputs => 0
 * - Non-positive radii => 0
 * - No overlap => 0
 * - Complete containment => area of smaller circle
 *
 * Notes:
 * - Uses clamped acos arguments and a guarded sqrt term for numerical stability.
 * - This function is symmetric in (r1, r2).
 */
export function circleIntersectionArea(d: number, r1: number, r2: number): number {
  if (!validCircleIntersectionInputs(d, r1, r2)) return 0;
  const { R, r } = sortedRadii(r1, r2);

  if (d >= R + r) return 0;
  if (d <= R - r) return Math.PI * r * r;

  const area = partialCircleIntersectionArea(d, R, r);
  const maxArea = Math.PI * r * r;
  return clamp(area, 0, maxArea);
}

/**
 * Fraction of the target disk area that is occulted by an occulter disk, based on sky-plane geometry.
 *
 * Returns a value in [0,1].
 */
function occultedAreaFraction(d: number, rTarget: number, rOcculter: number): number {
  if (!Number.isFinite(d) || d < 0) return 0;
  if (!isFinitePositive(rTarget) || !isFinitePositive(rOcculter)) return 0;

  const targetArea = Math.PI * rTarget * rTarget;
  if (!(targetArea > 0) || !Number.isFinite(targetArea)) return 0;

  const overlap = circleIntersectionArea(d, rTarget, rOcculter);
  return clamp01(overlap / targetArea);
}

/**
 * Visible fraction of the target disk after occultation by an occulter disk (sky-plane geometry).
 *
 * Returns a value in [0,1]:
 *   visible = 1 - occultedAreaFraction(...)
 */
function visibleAreaFraction(d: number, rTarget: number, rOcculter: number): number {
  return clamp01(1 - occultedAreaFraction(d, rTarget, rOcculter));
}

function finiteSkyPoint(point: SkyPoint3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function projectedSkyDistance(a: SkyPoint3, b: SkyPoint3): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Convenience helper for use in sim.ts when you already have sky-projected positions.
 *
 * Behavior:
 * - If occulterSky is not in front of targetSky (occulterSky.z <= targetSky.z), returns 1 (no dimming).
 * - Otherwise returns visibleAreaFraction(d_xy, rTarget, rOcculter).
 *
 * Convention (must match sim.ts / projectToSky):
 * - Larger z means closer to the observer.
 */
export function visibleFractionWhenOcculted(params: {
  targetSky: SkyPoint3;
  occulterSky: SkyPoint3;
  rTarget: number;
  rOcculter: number;
}): number {
  const { targetSky, occulterSky, rTarget, rOcculter } = params;

  if (!finiteSkyPoint(targetSky) || !finiteSkyPoint(occulterSky)) return 1;

  if (!isFinitePositive(rTarget) || !isFinitePositive(rOcculter)) return 1;

  if (occulterSky.z <= targetSky.z) return 1;

  return visibleAreaFraction(projectedSkyDistance(occulterSky, targetSky), rTarget, rOcculter);
}
