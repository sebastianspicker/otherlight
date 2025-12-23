// src/photometry/transitUniform.ts

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

function circleIntersectionArea(d: number, r1: number, r2: number): number {
  // Area of overlap (intersection) between two circles of radii r1, r2 with center distance d.
  // Robust guards for edge cases.
  if (!(Number.isFinite(d) && Number.isFinite(r1) && Number.isFinite(r2))) return 0;
  if (r1 <= 0 || r2 <= 0) return 0;

  const R = Math.max(r1, r2);
  const r = Math.min(r1, r2);

  if (d >= R + r) return 0;

  // One circle fully inside the other
  if (d <= R - r) return Math.PI * r * r;

  // Partial overlap
  // Use clamped acos arguments for numerical stability near tangency.
  const d2 = d * d;
  const R2 = R * R;
  const r2sq = r * r;

  const alpha = safeAcos((d2 + R2 - r2sq) / (2 * d * R));
  const beta  = safeAcos((d2 + r2sq - R2) / (2 * d * r));

  const part1 = R2 * alpha;
  const part2 = r2sq * beta;

  // Heron-like term for the triangular part; guard against tiny negative due to rounding.
  const part3Arg = (-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r);
  const part3 = 0.5 * Math.sqrt(Math.max(0, part3Arg));

  return part1 + part2 - part3;
}

function isInsideCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function sanitizeOcculters(rStar: number, occulters: Occulter[]): Occulter[] {
  // Remove invalid and obviously irrelevant occulters (cannot overlap star on sky plane).
  const out: Occulter[] = [];
  for (const o of occulters ?? []) {
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy) || !isFinitePositive(o.r)) continue;

    // Quick reject: no overlap possible between star disk and occulter disk
    const d = Math.hypot(o.dx, o.dy);
    if (d >= rStar + o.r) continue;

    out.push(o);
  }
  return out;
}

function anyOcculterFullyCoversStar(rStar: number, occulters: Occulter[]): boolean {
  // If an occulter completely covers the stellar disk in projection => flux = 0 (uniform disk).
  for (const o of occulters) {
    const d = Math.hypot(o.dx, o.dy);
    if (o.r >= rStar && d <= o.r - rStar) return true;
  }
  return false;
}

function blockedAreaByMidpointDiskIntegral(
  rStar: number,
  occulters: Occulter[],
  gridRes: number
): number {
  // Deterministic midpoint integration over the stellar disk (not the bounding square).
  // Integrate indicator function "blocked" over star area.
  const ny = Math.max(40, Math.floor(gridRes));
  const nx = ny; // keep roughly square cells in local row coordinates

  const starArea = Math.PI * rStar * rStar;
  const dy = (2 * rStar) / ny;

  let blockedArea = 0;

  for (let iy = 0; iy < ny; iy++) {
    const y = -rStar + (iy + 0.5) * dy;
    const y2 = y * y;

    // Half chord length at this y
    const xMax = Math.sqrt(Math.max(0, rStar * rStar - y2));
    if (xMax <= 0) continue;

    const dx = (2 * xMax) / nx;
    const cellArea = dx * dy;

    for (let ix = 0; ix < nx; ix++) {
      const x = -xMax + (ix + 0.5) * dx;

      // (x,y) is inside star by construction; test union of occulters
      let blocked = false;
      for (const o of occulters) {
        if (isInsideCircle(x, y, o.dx, o.dy, o.r)) {
          blocked = true;
          break;
        }
      }
      if (blocked) blockedArea += cellArea;
    }
  }

  // Numerical sanity clamp
  return clamp(blockedArea, 0, starArea);
}

/**
 * Normalized flux for a uniform-brightness stellar disk.
 * Returns flux F in [0,1], where 1 is unobscured.
 *
 * Notes:
 * - For 0 or 1 occulter, uses an analytic circle–circle intersection area.
 * - For ≥2 occulters, uses deterministic midpoint integration of the union silhouette
 *   over the stellar disk, preventing double-counting when occulters overlap.
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
  const occulters = sanitizeOcculters(rStar, params.rOcculters ?? []);

  if (occulters.length === 0) return 1.0;

  if (anyOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  // Fast/exact path for a single occulter
  if (occulters.length === 1) {
    const o = occulters[0];
    const d = Math.hypot(o.dx, o.dy);
    const blocked = circleIntersectionArea(d, rStar, o.r);
    return clamp01(1.0 - blocked / starArea);
  }

  // Robust path for multiple occulters: union via disk integral
  const gridRes = Math.max(60, Math.floor(params.gridRes ?? 220));
  const blockedArea = blockedAreaByMidpointDiskIntegral(rStar, occulters, gridRes);

  return clamp01(1.0 - blockedArea / starArea);
}
