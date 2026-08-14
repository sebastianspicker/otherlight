/** Shares deterministic projected-disk midpoint integration across transit models. */

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
  type OcculterPre as ShapeOcculterPre,
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

type DiskMidpointSetup = {
  rStar: number;
  rStar2: number;
  ny: number;
  nx: number;
  dy: number;
  earlyExitFluxEps: number;
};

type DiskRow = {
  y: number;
  y2: number;
  xMaxStar: number;
  dxCell: number;
  cellArea: number;
};

type DiskSums = {
  total: number;
  blocked: number;
  earlyExit: boolean;
};

function safeIntensity(v: unknown): number {
  // Defensive: treat NaN, infinities, and negative values as 0 contribution.
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

const precomputeOcculters = (occulters: CircleOcculter[]): OcculterPre[] => {
  if (!Array.isArray(occulters) || occulters.length === 0) return [];
  const out: OcculterPre[] = [];
  for (const o of occulters) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy) || !isFinitePositive(o.r)) continue;
    out.push({ dx: o.dx, dy: o.dy, r: o.r, r2: o.r * o.r });
  }
  return out;
};

const requireDiskMidpointInputs = (rStar: number, intensityAt: IntensityAtFn, caller: string): void => {
  if (!isFinitePositive(rStar)) {
    throw new Error(`${caller}: rStar must be a positive finite number.`);
  }
  if (typeof intensityAt !== "function") {
    throw new Error(`${caller}: intensityAt must be a function.`);
  }
};

const diskMidpointSetup = (params: {
  rStar: number;
  gridRes: number;
  earlyExitFluxEps?: number;
}): DiskMidpointSetup => {
  const ny = clampGridRes(params.gridRes, 60);
  return {
    rStar: params.rStar,
    rStar2: params.rStar * params.rStar,
    ny,
    nx: ny,
    dy: (2 * params.rStar) / ny,
    earlyExitFluxEps: isFiniteNonNegative(params.earlyExitFluxEps) ? params.earlyExitFluxEps : 0,
  };
};

const diskRowAt = (setup: DiskMidpointSetup, iy: number): DiskRow | undefined => {
  const y = -setup.rStar + (iy + 0.5) * setup.dy;
  const y2 = y * y;
  const xMaxStar = Math.sqrt(Math.max(0, setup.rStar2 - y2));
  if (!(xMaxStar > 0)) return undefined;
  const dxCell = (2 * xMaxStar) / setup.nx;
  return { y, y2, xMaxStar, dxCell, cellArea: dxCell * setup.dy };
};

const cleanDiskSums = (sums: DiskSums): IntegrateDiskMidpointResult => {
  const total = Number.isFinite(sums.total) && sums.total >= 0 ? sums.total : 0;
  const blockedRaw = Number.isFinite(sums.blocked) && sums.blocked >= 0 ? sums.blocked : 0;
  const blocked = clamp(blockedRaw, 0, total);
  return sums.earlyExit ? { total, blocked, earlyExit: true } : { total, blocked };
};

const rowOcculterGates = (y: number, occ: OcculterPre[]): OcculterRowGate[] | null => {
  const row: OcculterRowGate[] = [];
  for (const o of occ) {
    const dyo = y - o.dy;
    if (Math.abs(dyo) > o.r) continue;
    const xHalf = Math.sqrt(Math.max(0, o.r2 - dyo * dyo));
    row.push({ xMin: o.dx - xHalf, xMax: o.dx + xHalf, dx: o.dx, dy: o.dy, r2: o.r2 });
  }
  return row.length > 0 ? row : null;
};

const pointBlockedByRowGates = (x: number, y: number, row: OcculterRowGate[] | null): boolean => {
  if (!row) return false;
  for (const o of row) {
    if (x < o.xMin || x > o.xMax) continue;
    const dxo = x - o.dx;
    const dyo = y - o.dy;
    if (dxo * dxo + dyo * dyo < o.r2) return true;
  }
  return false;
};

const shouldEarlyExit = (sums: DiskSums, earlyExitFluxEps: number): boolean => {
  if (!(earlyExitFluxEps > 0 && sums.total > 0)) return false;
  return (sums.total - sums.blocked) / sums.total <= earlyExitFluxEps;
};

const diskCellContribution = (
  setup: DiskMidpointSetup,
  row: DiskRow,
  x: number,
  intensityAt: IntensityAtFn,
): number => {
  const rho2 = x * x + row.y2;
  const mu = Math.sqrt(Math.max(0, 1 - rho2 / setup.rStar2));
  const intensity = safeIntensity(intensityAt({ x, y: row.y, mu }));
  return intensity * row.cellArea;
};

const integrateUnoccultedDisk = (setup: DiskMidpointSetup, intensityAt: IntensityAtFn): number => {
  let total = 0;
  for (let iy = 0; iy < setup.ny; iy++) {
    const row = diskRowAt(setup, iy);
    if (!row) continue;
    for (let ix = 0; ix < setup.nx; ix++) {
      const x = -row.xMaxStar + (ix + 0.5) * row.dxCell;
      total += diskCellContribution(setup, row, x, intensityAt);
    }
  }
  return total;
};

const integrateCircularDiskRow = (
  setup: DiskMidpointSetup,
  row: DiskRow,
  gates: OcculterRowGate[] | null,
  intensityAt: IntensityAtFn,
  sums: DiskSums,
  accumulateTotal: boolean,
): void => {
  for (let ix = 0; ix < setup.nx; ix++) {
    const x = -row.xMaxStar + (ix + 0.5) * row.dxCell;
    const dI = diskCellContribution(setup, row, x, intensityAt);
    if (dI === 0) continue;
    if (accumulateTotal) sums.total += dI;
    if (pointBlockedByRowGates(x, row.y, gates)) sums.blocked += dI;
  }
};

const integrateShapeDiskRow = (
  setup: DiskMidpointSetup,
  row: DiskRow,
  occ: ShapeOcculterPre[],
  intensityAt: IntensityAtFn,
  sums: DiskSums,
  accumulateTotal: boolean,
): void => {
  for (let ix = 0; ix < setup.nx; ix++) {
    const x = -row.xMaxStar + (ix + 0.5) * row.dxCell;
    const dI = diskCellContribution(setup, row, x, intensityAt);
    if (dI === 0) continue;
    if (accumulateTotal) sums.total += dI;
    const frac = occ.length > 0 ? pointOccultedFraction(x, row.y, occ) : 0;
    if (frac > 0) sums.blocked += dI * frac;
  }
};

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
  requireDiskMidpointInputs(rStar, intensityAt, "integrateDiskMidpoint");
  const setup = diskMidpointSetup(params);
  const occ = precomputeOcculters(params.occulters);
  const hasOcculters = occ.length > 0;
  const boundedTotal = setup.earlyExitFluxEps > 0 ? integrateUnoccultedDisk(setup, intensityAt) : undefined;
  const sums: DiskSums = { total: boundedTotal ?? 0, blocked: 0, earlyExit: false };

  for (let iy = 0; iy < setup.ny; iy++) {
    const row = diskRowAt(setup, iy);
    if (!row) continue;
    integrateCircularDiskRow(
      setup,
      row,
      hasOcculters ? rowOcculterGates(row.y, occ) : null,
      intensityAt,
      sums,
      boundedTotal === undefined,
    );
    sums.earlyExit ||= shouldEarlyExit(sums, setup.earlyExitFluxEps);
    if (sums.earlyExit) break;
  }

  return cleanDiskSums(sums);
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
  requireDiskMidpointInputs(rStar, intensityAt, "integrateDiskMidpointShapes");
  const setup = diskMidpointSetup(params);
  const occ = precomputeOcculterShapes(sanitizeOcculterShapes(rStar, params.occulters));
  const boundedTotal = setup.earlyExitFluxEps > 0 ? integrateUnoccultedDisk(setup, intensityAt) : undefined;
  const sums: DiskSums = { total: boundedTotal ?? 0, blocked: 0, earlyExit: false };

  for (let iy = 0; iy < setup.ny; iy++) {
    const row = diskRowAt(setup, iy);
    if (!row) continue;
    integrateShapeDiskRow(setup, row, occ, intensityAt, sums, boundedTotal === undefined);
    sums.earlyExit ||= shouldEarlyExit(sums, setup.earlyExitFluxEps);
    if (sums.earlyExit) break;
  }

  return cleanDiskSums(sums);
}
