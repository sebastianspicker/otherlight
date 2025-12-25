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
// - 0 occulters: F=1
// - 1 occulter: analytic overlap area of two circles (star disk and occulter disk)
// - >=2 occulters: deterministic midpoint integration of the *union* silhouette over the stellar disk,
//   avoiding double-counting where occulters overlap.
//
// Continuity / edge-case policy (matches integrators):
// - Tangency is measure-zero. We treat d >= rStar + rOcc as "no overlap" (blocked area = 0). 
// - Full coverage is detected robustly: if d <= rOcc - rStar (and rOcc>=rStar) => F=0. 
// - Output is clamped into [0,1] for numeric hygiene. 
//
// Note:
// This module intentionally keeps the circle-only Occulter type as a fast path.
// General silhouettes (ellipses/rings) should use a generalized shape-union integrator.
//
// Single-source note (avoid divergence):
// - mutualEvents.ts exports circleIntersectionArea (public). 
// - occluderShapes.ts re-exports circleIntersectionArea from mutualEvents for consolidation. 
// To avoid circular dependencies, this file keeps a local implementation for now, but it is kept
// bit-for-bit compatible with mutualEvents.ts and should be refactored to import from it later. 

export type Occulter = { dx: number; dy: number; r: number };

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

function safeAcos(x: number): number {
  // Numerical guard: acos argument must be in [-1, 1]
  return Math.acos(clamp(x, -1, 1));
}

function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

function isFiniteNonNegative(x: number): boolean {
  return Number.isFinite(x) && x >= 0;
}

/**
 * Area of overlap (intersection) between two circles of radii r1, r2 separated by distance d.
 *
 * Robust for edge cases:
 * - Non-finite inputs => 0
 * - Non-positive radii => 0
 * - No overlap (including external tangency) => 0
 * - Full containment (including internal tangency) => area of smaller circle
 *
 * Numerical details:
 * - acos arguments are clamped to [-1,1]
 * - sqrt argument is guarded against tiny negative due to floating-point rounding
 */
function circleIntersectionArea(d: number, r1: number, r2: number): number {
  if (!Number.isFinite(d) || !Number.isFinite(r1) || !Number.isFinite(r2)) return 0;
  if (!(r1 > 0) || !(r2 > 0)) return 0;

  // Distance should be non-negative; negative indicates invalid input.
  if (d < 0) return 0;

  const R = Math.max(r1, r2);
  const r = Math.min(r1, r2);

  // No overlap (including external tangency).
  if (d >= R + r) return 0;

  // One circle fully inside the other (including internal tangency).
  if (d <= R - r) return Math.PI * r * r;

  // Partial overlap.
  const dSq = d * d;
  const RSq = R * R;
  const rSq = r * r;

  // acos arguments may drift slightly outside [-1,1] due to rounding; safeAcos clamps.
  const alpha = safeAcos((dSq + RSq - rSq) / (2 * d * R));
  const beta = safeAcos((dSq + rSq - RSq) / (2 * d * r));

  // "Kite" area term via robust product form; ensure non-negative inside sqrt.
  const part3Arg = (-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r);
  const part3 = 0.5 * Math.sqrt(Math.max(0, part3Arg));

  const area = RSq * alpha + rSq * beta - part3;

  // Guard against rare floating overshoots.
  return clamp(area, 0, Math.PI * r * r);
}

function sanitizeOcculters(rStar: number, occulters: Occulter[]): Occulter[] {
  // Remove invalid and obviously irrelevant occulters (cannot overlap star on sky plane).
  const out: Occulter[] = [];
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy) || !isFinitePositive(o.r)) continue;

    // Quick reject: no overlap possible between star disk and occulter disk
    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;

    // Tangency is measure-zero => treat as no overlap.
    if (d >= rStar + o.r) continue;

    out.push(o);
  }
  return out;
}

function anyOcculterFullyCoversStar(rStar: number, occulters: Occulter[]): boolean {
  // If an occulter completely covers the stellar disk in projection => flux = 0 (uniform disk).
  for (const o of occulters) {
    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;
    // Full containment of star disk by occulter disk.
    if (o.r >= rStar && d <= o.r - rStar) return true;
  }
  return false;
}

/**
 * Deterministic midpoint integration over the stellar disk (not the bounding square).
 * Integrates the indicator function "blocked" over star area, where blocked is the union of occulter disks.
 *
 * Implementation note:
 * - For each y-row, sample x in [-xMax, +xMax] where xMax is the chord half-length of the star at that y.
 * - This keeps samples inside the disk by construction and avoids wasting work outside the star.
 *
 * Important numeric note:
 * - Uses <= for point-in-occulter (blocked) which is consistent with tangency measure-zero and
 *   stable when combined with midpoint sampling. 
 */
function blockedAreaByMidpointDiskIntegral(rStar: number, occulters: Occulter[], gridRes: number): number {
  const ny = Math.max(40, Math.floor(gridRes));
  const nx = ny;

  const rStarSq = rStar * rStar;
  const starArea = Math.PI * rStarSq;

  const dy = (2 * rStar) / ny;

  // Precompute r^2 for occulters to avoid repeated multiplications in inner loops.
  const occ = occulters.map((o) => ({ dx: o.dx, dy: o.dy, r2: o.r * o.r }));

  let blockedArea = 0;

  for (let iy = 0; iy < ny; iy++) {
    const y = -rStar + (iy + 0.5) * dy;
    const ySq = y * y;

    const xMax = Math.sqrt(Math.max(0, rStarSq - ySq));
    if (!(xMax > 0)) continue;

    const dx = (2 * xMax) / nx;
    const cellArea = dx * dy;

    for (let ix = 0; ix < nx; ix++) {
      const x = -xMax + (ix + 0.5) * dx;

      let blocked = false;
      for (const o of occ) {
        const dxo = x - o.dx;
        const dyo = y - o.dy;
        if (dxo * dxo + dyo * dyo <= o.r2) {
          blocked = true;
          break;
        }
      }
      if (blocked) blockedArea += cellArea;
    }
  }

  // Numerical sanity clamp.
  return clamp(blockedArea, 0, starArea);
}

/**
 * Normalized flux for a uniform-brightness stellar disk.
 * Returns flux F in [0,1], where 1 is unobscured.
 *
 * Normalization invariants:
 * - If no valid occulters overlap: F = 1.0. 
 * - If any occulter fully covers star: F = 0.0. 
 * - Otherwise: F = 1 - (blocked_area / star_area) clamped to [0,1]. 
 *
 * Continuity notes:
 * - Analytic 1-occulter and numeric union (>=2) share the same geometric definitions
 *   and tangency conventions, so the result is continuous at boundaries up to integration error. 
 */
export function fluxUniformDisk(params: {
  rStar: number;
  rOcculters: Occulter[];
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
  if (!isFinitePositive(starArea)) {
    // Should be impossible if rStar is positive finite, but keep the guard.
    return 1.0;
  }

  const occulters = sanitizeOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;

  // Hard gate: full coverage => exactly 0 (avoids numeric integral missing a tiny crescent).
  if (anyOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  // Fast/exact path for a single occulter.
  if (occulters.length === 1) {
    const o = occulters[0];
    const d = Math.hypot(o.dx, o.dy);
    if (!isFiniteNonNegative(d)) return 1.0;

    const blocked = circleIntersectionArea(d, rStar, o.r);
    return clamp01(1.0 - blocked / starArea);
  }

  // Robust path for multiple occulters: union via disk integral.
  const rawGrid = params.gridRes ?? 220;
  const gridRes = Math.max(60, Math.floor(Number.isFinite(rawGrid) ? rawGrid : 220));

  const blockedArea = blockedAreaByMidpointDiskIntegral(rStar, occulters, gridRes);
  return clamp01(1.0 - blockedArea / starArea);
}

/**
 * Deterministic symmetry / regression grid for development (not used at runtime).
 *
 * Purpose:
 * - Provide a cheap, deterministic parameter-space scan to validate:
 *   - rotational symmetry of the 1-occulter analytic solution,
 *   - continuity near tangency and full-coverage boundaries,
 *   - clamp policy (stays within [0,1]).
 *
 * Returned rows are suitable for snapshot tests.
 *
 * Note:
 * - This does not depend on any test framework; it’s safe to import in dev tests.
 * - The numeric comparison uses the same midpoint integral as the multi-occulter code, so it can also
 *   be used to compare analytic-vs-numeric for a single occulter (optional).
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
  const dList =
    (params?.dList ?? [0, 0.2, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0]).filter((x) => typeof x === "number" && Number.isFinite(x) && x >= 0);
  const thetaList =
    (params?.thetaList ?? [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3]).filter(
      (x) => typeof x === "number" && Number.isFinite(x)
    );

  const gridResNumeric = Math.max(80, Math.floor(Number.isFinite(params?.gridResNumeric) ? (params!.gridResNumeric as number) : 400));

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

        // Numeric (union integral with a single occulter) for cross-check
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
