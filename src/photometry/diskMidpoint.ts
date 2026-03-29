// src/photometry/diskMidpoint.ts

//
// Generic deterministic midpoint integrator over a projected stellar disk,
// with union-of-circular-occulters masking.
//
// Shared core used to deduplicate:
// - transitUniform.ts (blocked area only; uniform intensity)
// - transitUniformSpots.ts (uniform baseline with brightness patches)
// - transitLimbDarkened.ts (limb-darkening + patches)
//
// Scientific conventions:
// - Star is a disk of radius rStar centered at (0,0) in the sky plane.
// - Integration is over projected area elements dA in that plane.
// - The stellar disk is parameterized by y rows; at each y we integrate along x in [-xMax, +xMax],
//   where xMax = sqrt(rStar^2 - y^2).
// - Midpoint rule is used in both y and x directions; results are deterministic.
// - Occulters are opaque circles in the same plane; union masking means a point is blocked
//   if it lies inside ANY occulter disk.
//
// Geometry conventions for mu:
// - For a point (x,y) on the projected stellar disk, let rho^2 = x^2 + y^2.
// - mu := cos(theta) is mu = sqrt(1 - rho^2 / rStar^2), clamped to [0,1].
//
// Numerical robustness:
// - Non-finite or negative intensities are treated as 0 at the integrator level (defensive).
// - total and blocked are clamped to be finite and satisfy 0 <= blocked <= total.
//
// Performance:
// - Per-row occulter intersection filtering (occRow) reduces distance checks.
// - Each row uses x-interval gates for each occulter.
//
// Dependency policy:
// - Keep dependency-light to avoid circular imports.

import { clamp, isFiniteNonNegative, isFinitePositive } from "../core/units";
import { clampGridRes, type CircleOcculter } from "./occulterCircle";
import {
  type OcculterShape,
  pointOccultedFraction,
  precomputeOcculterShapes,
  sanitizeOcculterShapes,
} from "./occulterEllipse";

export type IntensityAtFn = (args: { x: number; y: number; mu: number }) => number;

export type IntegrateDiskMidpointParams = {
  /** Stellar radius (must be > 0). */
  rStar: number;

  /** Circular occulters (may be empty). */
  occulters: CircleOcculter[];

  /**
   * Resolution parameter ~ number of samples across diameter in y.
   * The implementation uses nx = ny, but x spacing varies by chord length.
   */
  gridRes: number;

  /**
   * Local projected intensity I(x,y) up to an arbitrary scale.
   * The integrator returns absolute integrals; normalization is up to the caller.
   */
  intensityAt: IntensityAtFn;

  /**
   * Optional early-exit threshold for deep eclipses.
   * If > 0, integration may stop once the remaining flux fraction
   * (total - blocked) / total falls below this epsilon.
   *
   * Default: 0 (disabled).
   *
   * Accuracy tradeoff:
   * - Enabling earlyExitFluxEps changes the numerical result (it is not just a performance optimization),
   *   because it truncates the integral once the remaining flux fraction is small.
   * - Use only when small residual flux differences below `earlyExitFluxEps` are acceptable.
   *
   * When early-exit triggers, the returned result sets `earlyExit: true` so callers can surface a warning.
   */
  earlyExitFluxEps?: number;
};

export type IntegrateDiskMidpointShapesParams = {
  /** Stellar radius (must be > 0). */
  rStar: number;

  /** Mixed-shape occulters (may be empty). */
  occulters: OcculterShape[];

  /**
   * Resolution parameter ~ number of samples across diameter in y.
   * The implementation uses nx = ny, but x spacing varies by chord length.
   */
  gridRes: number;

  /** Local projected intensity I(x,y) up to an arbitrary scale. */
  intensityAt: IntensityAtFn;

  /** Optional early-exit tolerance for deep eclipses. */
  earlyExitFluxEps?: number;
};

export type IntegrateDiskMidpointResult = {
  /** ∫_disk I(x,y) dA */
  total: number;

  /** ∫_{disk ∩ union(occulters)} I(x,y) dA */
  blocked: number;

  /** True if early-exit triggered (informational). */
  earlyExit?: boolean;
};

type OcculterPre = { dx: number; dy: number; r: number; r2: number };

type OcculterRowGate = {
  xMin: number;
  xMax: number;
  dx: number;
  dy: number;
  r2: number;
};

function safeIntensity(v: unknown): number {
  // Defensive: treat NaN, infinities, and negative values as 0 contribution.
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function precomputeOcculters(occulters: CircleOcculter[]): OcculterPre[] {
  if (!Array.isArray(occulters) || occulters.length === 0) return [];
  const out: OcculterPre[] = [];
  for (const o of occulters) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy) || !isFinitePositive(o.r)) continue;
    out.push({ dx: o.dx, dy: o.dy, r: o.r, r2: o.r * o.r });
  }
  return out;
}

/**
 * Deterministic midpoint integration over the stellar disk.
 *
 * Returns absolute integrals (not normalized flux).
 * - For uniform disk, set intensityAt=()=>1 and divide by (pi rStar^2) if needed.
 * - For patchy/limb-darkened disk, let intensityAt return your brightness factor.
 */
export function integrateDiskMidpoint(params: IntegrateDiskMidpointParams): IntegrateDiskMidpointResult {
  const { intensityAt } = params;
  const rStar = params.rStar;

  if (!isFinitePositive(rStar)) {
    throw new Error("integrateDiskMidpoint: rStar must be a positive finite number.");
  }

  if (typeof intensityAt !== "function") {
    throw new Error("integrateDiskMidpoint: intensityAt must be a function.");
  }

  // Unified minimum-grid policy: clampGridRes already enforces a minimum.
  const ny = clampGridRes(params.gridRes, 60);
  const nx = ny;

  const rStar2 = rStar * rStar;
  const dy = (2 * rStar) / ny;

  const occ = precomputeOcculters(params.occulters);
  const hasOcculters = occ.length > 0;
  const earlyExitFluxEps = isFiniteNonNegative(params.earlyExitFluxEps) ? params.earlyExitFluxEps : 0;

  let total = 0;
  let blocked = 0;
  let earlyExit = false;

  for (let iy = 0; iy < ny; iy++) {
    const y = -rStar + (iy + 0.5) * dy;
    const y2 = y * y;

    // Chord half-length inside star.
    const xMaxStar = Math.sqrt(Math.max(0, rStar2 - y2));
    if (!(xMaxStar > 0)) continue;

    const dxCell = (2 * xMaxStar) / nx;
    const cellArea = dxCell * dy;

    // Build per-row occulter gating: only occulters intersecting this y, with x-range culling.
    let occRow: OcculterRowGate[] | null = null;

    if (hasOcculters) {
      const row: OcculterRowGate[] = [];
      for (const o of occ) {
        const dyo = y - o.dy;
        if (Math.abs(dyo) > o.r) continue; // this y-row does not intersect occulter disk

        const xHalf = Math.sqrt(Math.max(0, o.r2 - dyo * dyo));
        row.push({ xMin: o.dx - xHalf, xMax: o.dx + xHalf, dx: o.dx, dy: o.dy, r2: o.r2 });
      }
      occRow = row.length > 0 ? row : null;
    }

    for (let ix = 0; ix < nx; ix++) {
      const x = -xMaxStar + (ix + 0.5) * dxCell;
      const rho2 = x * x + y2;

      // mu for points on the disk, clamped to [0,1] for numeric safety.
      const mu = Math.sqrt(Math.max(0, 1 - rho2 / rStar2));

      const I = safeIntensity(intensityAt({ x, y, mu }));
      if (I === 0) continue;

      const dI = I * cellArea;
      total += dI;

      if (!occRow) continue;

      // Union-of-occulters mask.
      let isBlocked = false;
      for (const o of occRow) {
        // Cheap x-range gate.
        if (x < o.xMin || x > o.xMax) continue;

        const dxo = x - o.dx;
        const dyo = y - o.dy;

        // Tangency is measure-zero; treat boundary as NOT blocked to avoid edge flicker.
        if (dxo * dxo + dyo * dyo < o.r2) {
          isBlocked = true;
          break;
        }
      }

      if (isBlocked) blocked += dI;
    } // end for ix

    // Optional early exit for deep eclipses (approximation).
    if (earlyExitFluxEps > 0 && total > 0) {
      const remainingFrac = (total - blocked) / total;
      if (remainingFrac <= earlyExitFluxEps) {
        earlyExit = true;
      }
    }

    if (earlyExit) break;
  } // end for iy

  // Numerical hygiene.
  if (!Number.isFinite(total) || total < 0) total = 0;
  if (!Number.isFinite(blocked) || blocked < 0) blocked = 0;
  blocked = clamp(blocked, 0, total);

  return earlyExit ? { total, blocked, earlyExit } : { total, blocked };
}

/**
 * Midpoint integration over a stellar disk with mixed-shape occulters.
 * This is a generic fallback for ellipses/rings and other non-circular silhouettes.
 */
export function integrateDiskMidpointShapes(
  params: IntegrateDiskMidpointShapesParams,
): IntegrateDiskMidpointResult {
  const { intensityAt } = params;
  const rStar = params.rStar;

  if (!isFinitePositive(rStar)) {
    throw new Error("integrateDiskMidpointShapes: rStar must be a positive finite number.");
  }

  if (typeof intensityAt !== "function") {
    throw new Error("integrateDiskMidpointShapes: intensityAt must be a function.");
  }

  const ny = clampGridRes(params.gridRes, 60);
  const nx = ny;

  const rStar2 = rStar * rStar;
  const dy = (2 * rStar) / ny;

  const occ = precomputeOcculterShapes(sanitizeOcculterShapes(rStar, params.occulters));
  const hasOcculters = occ.length > 0;
  const earlyExitFluxEps = isFiniteNonNegative(params.earlyExitFluxEps) ? params.earlyExitFluxEps : 0;

  let total = 0;
  let blocked = 0;
  let earlyExit = false;

  for (let iy = 0; iy < ny; iy++) {
    const y = -rStar + (iy + 0.5) * dy;
    const y2 = y * y;

    const xMaxStar = Math.sqrt(Math.max(0, rStar2 - y2));
    if (!(xMaxStar > 0)) continue;

    const dxCell = (2 * xMaxStar) / nx;
    const cellArea = dxCell * dy;

    for (let ix = 0; ix < nx; ix++) {
      const x = -xMaxStar + (ix + 0.5) * dxCell;
      const rho2 = x * x + y2;
      const mu = Math.sqrt(Math.max(0, 1 - rho2 / rStar2));

      const I = safeIntensity(intensityAt({ x, y, mu }));
      if (I === 0) continue;

      const dI = I * cellArea;
      total += dI;

      if (hasOcculters) {
        const frac = pointOccultedFraction(x, y, occ);
        if (frac > 0) {
          blocked += dI * frac;
        }
      }

      if (earlyExitFluxEps > 0 && total > 0) {
        const remainingFrac = (total - blocked) / total;
        if (remainingFrac <= earlyExitFluxEps) {
          earlyExit = true;
          break;
        }
      }
    }

    if (earlyExit) break;
  }

  if (!Number.isFinite(total) || total < 0) total = 0;
  if (!Number.isFinite(blocked) || blocked < 0) blocked = 0;
  blocked = clamp(blocked, 0, total);

  return earlyExit ? { total, blocked, earlyExit } : { total, blocked };
}
