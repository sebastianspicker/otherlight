// src/photometry/mutualEvents.ts
//
// Mutual-event utilities for two luminous/opaque disks in the sky plane.
//
// Purpose in this codebase:
// - The stellar transit photometry already handles multiple occulters as a union over the star disk. 
// - Mutual events (moon in front of planet / planet in front of moon) primarily matter for
//   *planetary / lunar self-flux* terms (phase curves, thermal emission). 
// - This module provides robust geometry for scaling an object's additive flux by the fraction of
//   its projected disk that remains visible when another disk occults it. 
//
// Scientific model (minimal but geometrically correct):
// - Both bodies are modeled as *opaque* circles on the sky plane.
// - The visible fraction of a target disk is:
//     f_visible = 1 - A_overlap / (π R_target^2)
//   where A_overlap is the area of intersection of two circles.
//
// Z-order / depth convention (CRITICAL):
// - sim.ts assumes: “larger z = closer to the observer” for projectToSky output. 
// - visibleFractionWhenOcculted uses the same rule: the occulter blocks the target only if
//   occulterSky.z > targetSky.z. 
// - If projectToSky.z semantics ever change, BOTH sim.ts and this function must be updated together. 
//
// What this module does *not* do (by design):
// - No limb darkening / brightness gradients on the planet/moon.
// - No terminator weighting (day/night boundary) for reflected/thermal flux.
// - No partial transparency.
// - No handling of the star occulting the planet (secondary eclipse), which is handled in sim.ts. 
//
// IMPORTANT usage note (also per sim.ts):
// - visibleFractionWhenOcculted is intended to scale ONLY additive self-flux terms (planet/moon phase/thermal). 
// - It must NOT be applied to the stellar transit attenuation; that is handled by the transit integrators. 
//
// Notes on correctness / robustness:
// - Uses numerically stable circle intersection area formula with clamped acos arguments.
// - Guards against tiny negative values in the sqrt term due to floating-point rounding.
// - Preserves backwards compatibility: existing exports keep their names and behavior,
//   while additional aliases/helpers are added.


import { clamp, clamp01 } from "../core/units"; // 

/** Local finite-positive check (avoid pulling other modules). */
function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/** Safe acos with clamped argument for numeric stability near tangency. */
function safeAcos(x: number): number {
  return Math.acos(clamp(x, -1, 1));
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
  if (!Number.isFinite(d) || !Number.isFinite(r1) || !Number.isFinite(r2)) return 0;
  if (!(r1 > 0) || !(r2 > 0)) return 0;

  // Distances are non-negative; a negative d indicates invalid input.
  if (d < 0) return 0;

  // Reorder for a slightly cleaner containment clamp.
  const R = Math.max(r1, r2);
  const r = Math.min(r1, r2);

  // No overlap (including external tangency).
  if (d >= R + r) return 0;

  // Complete containment (including internal tangency).
  if (d <= R - r) return Math.PI * r * r;

  // Partial overlap (two sectors minus kite area).
  const dSq = d * d;
  const RSq = R * R;
  const rSq = r * r;

  // acos arguments may drift slightly outside [-1,1] due to rounding => safeAcos clamps.
  const alpha = safeAcos((dSq + RSq - rSq) / (2 * d * R));
  const beta = safeAcos((dSq + rSq - RSq) / (2 * d * r));

  // "Kite" area term; ensure non-negative inside sqrt.
  const part3Arg = (-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r);
  const part3 = 0.5 * Math.sqrt(Math.max(0, part3Arg));

  const area = RSq * alpha + rSq * beta - part3;

  // Clamp to [0, area_of_smaller] to avoid rare floating overshoots.
  const maxArea = Math.PI * r * r;
  return clamp(area, 0, maxArea);
}

/**
 * Fraction of the target disk area that is occulted by an occulter disk, based on sky-plane geometry.
 *
 * Returns a value in [0,1].
 *
 * Inputs:
 * - d: center distance in sky plane
 * - rTarget: radius of the target (the body whose flux you want to scale)
 * - rOcculter: radius of the occulting body
 */
export function occultedAreaFraction(d: number, rTarget: number, rOcculter: number): number {
  if (!Number.isFinite(d) || d < 0) return 0;
  if (!isFinitePositive(rTarget) || !isFinitePositive(rOcculter)) return 0;

  const targetArea = Math.PI * rTarget * rTarget;
  if (!(targetArea > 0) || !Number.isFinite(targetArea)) return 0;

  const overlap = circleIntersectionArea(d, rTarget, rOcculter);
  const frac = overlap / targetArea;

  return clamp01(frac);
}

/**
 * Visible fraction of the target disk after occultation by an occulter disk (sky-plane geometry).
 *
 * Returns a value in [0,1]:
 *   visible = 1 - occultedAreaFraction(...)
 */
export function visibleAreaFraction(d: number, rTarget: number, rOcculter: number): number {
  return clamp01(1 - occultedAreaFraction(d, rTarget, rOcculter));
}

/**
 * Convenience helper for use in sim.ts when you already have sky-projected positions.
 *
 * Inputs:
 * - targetSky: target center coordinates (x,y,z)
 * - occulterSky: occulter center coordinates (x,y,z)
 * - rTarget: target radius
 * - rOcculter: occulter radius
 *
 * Behavior:
 * - If occulterSky is not in front of targetSky (occulterSky.z <= targetSky.z), returns 1 (no dimming).
 * - Otherwise returns visibleAreaFraction(d_xy, rTarget, rOcculter).
 *
 * Convention (must match sim.ts / projectToSky):
 * - Larger z means closer to the observer. 
 */
export function visibleFractionWhenOcculted(params: {
  targetSky: { x: number; y: number; z: number };
  occulterSky: { x: number; y: number; z: number };
  rTarget: number;
  rOcculter: number;
}): number {
  const { targetSky, occulterSky, rTarget, rOcculter } = params;

  if (
    !Number.isFinite(targetSky.x) ||
    !Number.isFinite(targetSky.y) ||
    !Number.isFinite(targetSky.z) ||
    !Number.isFinite(occulterSky.x) ||
    !Number.isFinite(occulterSky.y) ||
    !Number.isFinite(occulterSky.z)
  ) {
    return 1;
  }

  if (!isFinitePositive(rTarget) || !isFinitePositive(rOcculter)) return 1;

  // Occulter must be closer to the observer to block the target. 
  if (occulterSky.z <= targetSky.z) return 1;

  const d = Math.hypot(occulterSky.x - targetSky.x, occulterSky.y - targetSky.y);
  return visibleAreaFraction(d, rTarget, rOcculter);
}

/**
 * Alias for clarity in higher-level code:
 * - "visibleFractionWhenOcculted" already returns a visible *area* fraction for uniform-brightness disks.
 * - This alias helps when reading code that combines it with additive self-flux terms.
 */
export const visibleDiskFractionWhenOcculted = visibleFractionWhenOcculted;

/**
 * Compute visible fraction without any z-ordering rule.
 *
 * Use-case:
 * - Caller already checked which object is in front (or wants purely geometric overlap).
 *
 * Returns visibleAreaFraction(d_xy, rTarget, rOcculter) with basic input validation.
 */
export function visibleFractionNoDepthCheck(params: {
  dx: number;
  dy: number;
  rTarget: number;
  rOcculter: number;
}): number {
  const { dx, dy, rTarget, rOcculter } = params;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 1;
  if (!isFinitePositive(rTarget) || !isFinitePositive(rOcculter)) return 1;
  const d = Math.hypot(dx, dy);
  return visibleAreaFraction(d, rTarget, rOcculter);
}

/**
 * Convenience: occulted fraction with the same z-ordering convention as visibleFractionWhenOcculted.
 *
 * Returns:
 * - 0 if occulter is not in front or inputs invalid
 * - otherwise 1 - visibleFractionWhenOcculted(...)
 */
export function occultedFractionWhenOcculting(params: {
  targetSky: { x: number; y: number; z: number };
  occulterSky: { x: number; y: number; z: number };
  rTarget: number;
  rOcculter: number;
}): number {
  const vis = visibleFractionWhenOcculted(params);
  return clamp01(1 - vis);
}

// ---------------------------
// Minimal built-in tests
// ---------------------------
//
// These tests are dependency-free and only run if runMutualEventsSelfTests() is called.
// They validate overlap geometry and z-order behavior, including edge/tangency cases.

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`mutualEvents self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

function in01(x: number): boolean {
  return Number.isFinite(x) && x >= -1e-12 && x <= 1 + 1e-12;
}

/**
 * Self-tests for:
 * - circleIntersectionArea edge cases (no overlap, tangency, containment).
 * - visibleFractionWhenOcculted z-order rule (occulter blocks only if z is larger).
 * - symmetry/consistency checks on overlap fractions.
 */
export function runMutualEventsSelfTests(): void {
  // No overlap (separated):
  {
    const a = circleIntersectionArea(10, 1, 1);
    assert(approxEq(a, 0), "No-overlap area should be 0.");
  }

  // External tangency (measure-zero overlap):
  {
    const a = circleIntersectionArea(2, 1, 1);
    assert(approxEq(a, 0), "External tangency area should be 0.");
  }

  // Complete containment:
  {
    const a = circleIntersectionArea(0.5, 2, 1);
    assert(approxEq(a, Math.PI * 1 * 1, 1e-10), "Containment should equal smaller circle area.");
  }

  // Identical circles, perfect overlap:
  {
    const a = circleIntersectionArea(0, 1, 1);
    assert(approxEq(a, Math.PI, 1e-10), "Coincident circles should overlap fully.");
    const fOcc = occultedAreaFraction(0, 1, 1);
    const fVis = visibleAreaFraction(0, 1, 1);
    assert(approxEq(fOcc, 1, 1e-12), "Occulted fraction should be 1 for identical coincident disks.");
    assert(approxEq(fVis, 0, 1e-12), "Visible fraction should be 0 for identical coincident disks.");
  }

  // Fraction bounds:
  {
    const f = occultedAreaFraction(0.8, 1, 1);
    assert(in01(f), "Occulted fraction must be in [0,1].");
    const v = visibleAreaFraction(0.8, 1, 1);
    assert(in01(v), "Visible fraction must be in [0,1].");
    assert(approxEq(f + v, 1, 1e-12), "Visible+occulted should sum to 1 (area fractions).");
  }

  // Z-order: occulter must have strictly larger z to block:
  {
    const targetSky = { x: 0, y: 0, z: 1 };
    const occulterSameDepth = { x: 0, y: 0, z: 1 };
    const occulterBehind = { x: 0, y: 0, z: 0.9 };
    const occulterInFront = { x: 0, y: 0, z: 1.1 };

    const rTarget = 1;
    const rOcc = 1;

    assert(
      approxEq(
        visibleFractionWhenOcculted({ targetSky, occulterSky: occulterSameDepth, rTarget, rOcculter: rOcc }),
        1
      ),
      "Same depth should not occult (returns 1)."
    );
    assert(
      approxEq(
        visibleFractionWhenOcculted({ targetSky, occulterSky: occulterBehind, rTarget, rOcculter: rOcc }),
        1
      ),
      "Occulter behind should not occult (returns 1)."
    );
    assert(
      approxEq(
        visibleFractionWhenOcculted({ targetSky, occulterSky: occulterInFront, rTarget, rOcculter: rOcc }),
        0
      ),
      "Occulter in front with same center and equal radius should fully occult (returns 0)."
    );
  }
}
