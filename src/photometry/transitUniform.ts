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


import { circleIntersectionArea } from "./mutualEvents";
import {
  anyCircleOcculterFullyCoversStar,
  clampGridRes,
  sanitizeCircleOcculters,
  type CircleOcculter,
} from "./occulterCircle";
import { integrateDiskMidpoint } from "./diskMidpoint";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
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

  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDisk: rStar must be a positive finite number.");
  }

  const starArea = Math.PI * rStar * rStar;
  if (!isFinitePositive(starArea)) return 1.0;

  // Single source: sanitize + full cover checks live in occulterCircle.ts.
  const occulters = sanitizeCircleOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;

  // Hard gate: full coverage => exactly 0 (avoids numeric integral missing a tiny crescent).
  if (anyCircleOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  // Fast/exact path for a single occulter.
  if (occulters.length === 1) {
    const o = occulters[0];
    const d = Math.hypot(o.dx, o.dy);
    if (!isFiniteNonNegative(d)) return 1.0;

    const blocked = circleIntersectionArea(d, rStar, o.r);
    return clamp01(1.0 - blocked / starArea);
  }

  // Robust path for multiple occulters: union via disk integral.
  const gridRes = clampGridRes(params.gridRes, 220);
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
 * Deterministic symmetry / regression grid for development (not used at runtime).
 * Returned rows are suitable for snapshot tests.
 */
export function debugTransitUniformGrid(params?: {
  rStar?: number;
  rOccList?: number[];
  dList?: number[];
  thetaList?: number[];
  gridResNumeric?: number;
}): Array<{
  rStar: number;
  rOcc: number;
  d: number;
  theta: number;
  dx: number;
  dy: number;
  F_analytic: number;
  F_numeric: number;
  absDiff: number;
}> {
  const rStar = isFinitePositive(params?.rStar) ? (params!.rStar as number) : 1;

  const rOccList = (params?.rOccList ?? [0.2, 0.5, 1.0, 1.5]).filter((x) => isFinitePositive(x));
  const dList = (params?.dList ?? [0, 0.2, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0]).filter(
    (x) => typeof x === "number" && Number.isFinite(x) && x >= 0
  );
  const thetaList = (params?.thetaList ?? [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3]).filter(
    (x) => typeof x === "number" && Number.isFinite(x)
  );

  const gridResNumeric = clampGridRes(params?.gridResNumeric, 400, { minRes: 80 });

  const out: Array<{
    rStar: number;
    rOcc: number;
    d: number;
    theta: number;
    dx: number;
    dy: number;
    F_analytic: number;
    F_numeric: number;
    absDiff: number;
  }> = [];

  const starArea = Math.PI * rStar * rStar;

  for (const rOcc of rOccList) {
    for (const d of dList) {
      for (const theta of thetaList) {
        const dx = d * Math.cos(theta);
        const dy = d * Math.sin(theta);

        // Analytic
        const blockedA = circleIntersectionArea(Math.hypot(dx, dy), rStar, rOcc);
        const F_analytic = clamp01(1.0 - blockedA / starArea);

        // Numeric (union integral with a single occulter) for cross-check.
        const blockedN = blockedAreaByMidpointDiskIntegral(rStar, [{ dx, dy, r: rOcc }], gridResNumeric);
        const F_numeric = clamp01(1.0 - blockedN / starArea);

        out.push({
          rStar,
          rOcc,
          d,
          theta,
          dx,
          dy,
          F_analytic,
          F_numeric,
          absDiff: Math.abs(F_analytic - F_numeric),
        });
      }
    }
  }

  return out;
}

// Backwards-compat: keep the old exported name if other modules import it as Occulter.
export type Occulter = CircleOcculter;
