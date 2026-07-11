// src/photometry/transitUniform.ts
//
// Uniform-brightness stellar disk transit photometry for *circular* opaque occulters.
//
// Scientific model:
// - Star: uniformly bright disk of radius rStar in the sky plane.
// - Occulters (planet/moon): opaque circles in the same plane.
// - Output: normalized stellar flux attenuation factor F in [0,1] where 1 is unobscured.
//
// Numerical approach:
// - 0 occulters: F = 1
// - 1 occulter: analytic overlap area of two circles (star disk and occulter disk)
// - >=2 occulters: deterministic midpoint integration of the *union* silhouette over the stellar disk,
//   avoiding double-counting where occulters overlap.
//
// Continuity / edge-case policy (must match other integrators):
// - Tangency is measure-zero. We treat d >= rStar + rOcc as "no overlap" (blocked area = 0).
// - Full coverage is detected robustly: if rOcc >= rStar and d <= rOcc - rStar => F = 0.
// - Output is clamped into [0,1] for numeric hygiene.
//
// Single-source note (avoid divergence):
// - mutualEvents.ts exports circleIntersectionArea (public).
// - occulterCircle.ts exports CircleOcculter + sanitizers and policies.
//
// Repo-wide convention (do not diverge across integrators):
// - Tangency is measure-zero. Point-in-occulter tests must use strict "<" (not "<=").
// - Overlap prefilters may use d >= rStar + rOcc => reject (tangency rejected).
// - Full-cover detection may include boundary d <= rOcc - rStar (containment boundary counts).
// Canonical definitions live in occulterCircle.ts; this module is the reference integrator behavior.

import { clamp01, isFiniteNonNegative, isFinitePositive } from "../core/units";
import { circleIntersectionArea } from "./mutualEvents";
import {
  anyCircleOcculterFullyCoversStar,
  clampGridRes,
  sanitizeCircleOcculters,
  type CircleOcculter,
} from "./occulterCircle";
import { integrateDiskMidpoint } from "./diskMidpoint";

function uniformStarArea(rStar: number): number {
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDisk: rStar must be a positive finite number.");
  }
  return Math.PI * rStar * rStar;
}

function singleOcculterUniformFlux(rStar: number, starArea: number, occulter: CircleOcculter): number {
  const d = Math.hypot(occulter.dx, occulter.dy);
  if (!isFiniteNonNegative(d)) return 1.0;
  const blocked = circleIntersectionArea(d, rStar, occulter.r);
  return clamp01(1.0 - blocked / starArea);
}

function multiOcculterUniformFlux(
  rStar: number,
  starArea: number,
  occulters: CircleOcculter[],
  gridResRaw: number | undefined,
): number {
  const gridRes = clampGridRes(gridResRaw, 220);
  const blockedArea = integrateDiskMidpoint({
    rStar,
    occulters,
    gridRes,
    intensityAt: () => 1,
    earlyExitFluxEps: 0,
  }).blocked;
  return clamp01(1.0 - blockedArea / starArea);
}

/**
 * Normalized flux for a uniform-brightness stellar disk.
 * Returns flux F in [0,1], where 1 is unobscured.
 *
 * Normalization invariants:
 * - If no valid occulters overlap: F = 1.0.
 * - If any occulter fully covers star: F = 0.0.
 * - Otherwise: F = 1 - blocked_area/star_area clamped to [0,1].
 */
export function fluxUniformDisk(params: {
  rStar: number;
  rOcculters?: readonly CircleOcculter[];
  /**
   * Resolution parameter for the disk integral when >=2 occulters.
   * Roughly corresponds to samples across the stellar diameter in y-direction.
   */
  gridRes?: number;
}): number {
  const rStar = params.rStar;
  const starArea = uniformStarArea(rStar);
  if (!isFinitePositive(starArea)) return 1.0;

  const occulters = sanitizeCircleOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;

  if (anyCircleOcculterFullyCoversStar(rStar, occulters)) return 0.0;
  if (occulters.length === 1) return singleOcculterUniformFlux(rStar, starArea, occulters[0]);
  return multiOcculterUniformFlux(rStar, starArea, occulters, params.gridRes);
}

// Backwards-compat: keep the old exported name if other modules import it as Occulter.
export type Occulter = CircleOcculter;
