// src/photometry/transitUniformSpots.ts
//
// Uniform-brightness stellar disk transit photometry with stellar spots/faculae,
// using deterministic midpoint integration over the stellar disk.
//
// Scientific model (simple but useful):
// - The star has uniform baseline specific intensity I0 across its disk.
// - Brightness patches (spots/faculae) multiply local intensity by factor f.
// - Occulters are opaque disks blocking projected light.
//
// Returns flux normalized to the unocculted spotted star (same patch map): F=1 out of transit.
//

import type { BrightnessPatch } from "../core/types";
import type { Occulter } from "./transitUniform";

import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode, type PatchPre } from "./patches";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/**
 * Sanitize occulters:
 * - remove NaNs/infs
 * - require r > 0
 * - quick reject those that cannot overlap the stellar disk in projection
 */
function sanitizeOcculters(rStar: number, occulters: Occulter[]): Occulter[] {
  const out: Occulter[] = [];
  if (!Array.isArray(occulters) || occulters.length === 0) return out;

  for (const o of occulters) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy) || !isFinitePositive(o.r)) continue;

    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;

    // Tangency is measure-zero: keep "<" behavior for stability near edges.
    if (d >= rStar + o.r) continue;

    out.push(o);
  }
  return out;
}

function anyOcculterFullyCoversStar(rStar: number, occulters: Occulter[]): boolean {
  for (const o of occulters) {
    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;

    // Star disk fully inside occulter disk if d + rStar <= rOcc.
    if (o.r >= rStar && d <= o.r - rStar) return true;
  }
  return false;
}

type OcculterPre = { dx: number; dy: number; r: number; r2: number };

function clampGridRes(raw: unknown, fallback: number): number {
  const g = typeof raw === "number" ? raw : Number(raw);
  const base = Number.isFinite(g) ? g : fallback;
  return Math.max(60, Math.floor(base));
}

/**
 * Deterministic midpoint integration over the stellar disk computing:
 * - totalIntensity = ∫ I(x,y) dA, where I = patchFactor(x,y) (baseline I0 cancels by normalization)
 * - blockedIntensity = ∫_{blocked by union(occulters)} I(x,y) dA
 */
function integrateUniformSpottedDiskMidpoint(params: {
  rStar: number;
  occulters: Occulter[];
  gridRes: number;
  patches: PatchPre[];
  patchCombineMode: PatchCombineMode;
}): { totalIntensity: number; blockedIntensity: number } {
  const { rStar, occulters, gridRes, patches, patchCombineMode } = params;

  const ny = Math.max(40, Math.floor(gridRes));
  const nx = ny;

  const rStar2 = rStar * rStar;
  const dy = (2 * rStar) / ny;

  // Precompute occulter geometry.
  const occ: OcculterPre[] = occulters.map((o) => ({ dx: o.dx, dy: o.dy, r: o.r, r2: o.r * o.r }));

  let totalIntensity = 0;
  let blockedIntensity = 0;

  for (let iy = 0; iy < ny; iy++) {
    const y = -rStar + (iy + 0.5) * dy;
    const y2 = y * y;

    const xMaxStar = Math.sqrt(Math.max(0, rStar2 - y2));
    if (!(xMaxStar > 0)) continue;

    const dxCell = (2 * xMaxStar) / nx;
    const cellArea = dxCell * dy;

    // Optional micro-optimization: per-row occulter strip intersection (same trick as LD integrator).
    const occRow: Array<{ xMin: number; xMax: number; dx: number; dy: number; r2: number }> = [];
    for (const o of occ) {
      const dyo = y - o.dy;
      if (Math.abs(dyo) > o.r) continue;
      const xHalf = Math.sqrt(Math.max(0, o.r2 - dyo * dyo));
      occRow.push({ xMin: o.dx - xHalf, xMax: o.dx + xHalf, dx: o.dx, dy: o.dy, r2: o.r2 });
    }

    for (let ix = 0; ix < nx; ix++) {
      const x = -xMaxStar + (ix + 0.5) * dxCell;

      const I = patchFactorAt(x, y, patches, patchCombineMode);
      const dI = I * cellArea;
      totalIntensity += dI;

      if (occRow.length === 0) continue;

      let blocked = false;
      for (const o of occRow) {
        if (x < o.xMin || x > o.xMax) continue;
        const dxo = x - o.dx;
        const dyo = y - o.dy;
        if (dxo * dxo + dyo * dyo <= o.r2) {
          blocked = true;
          break;
        }
      }
      if (blocked) blockedIntensity += dI;
    }
  }

  if (!Number.isFinite(totalIntensity)) totalIntensity = 0;
  if (!Number.isFinite(blockedIntensity)) blockedIntensity = 0;

  totalIntensity = Math.max(0, totalIntensity);
  blockedIntensity = clamp(blockedIntensity, 0, totalIntensity);

  return { totalIntensity, blockedIntensity };
}

/**
 * Normalized flux for a uniform-brightness stellar disk with brightness patches (spots/faculae)
 * and circular occulters.
 *
 * Returns F in [0,1], where 1 is unobscured relative to the same patchy star. 
 */
export function fluxUniformDiskWithPatches(params: {
  rStar: number;
  rOcculters: Occulter[];
  brightnessPatches?: BrightnessPatch[];
  /**
   * Resolution parameter for the disk integral.
   * Roughly corresponds to samples across the stellar diameter in y-direction.
   *
   * Typical:
   * - 180..260 for interactive rendering
   * - 300..600 for higher precision (slower)
   */
  gridRes?: number;
  /**
   * Patch-combination policy (optional).
   * Default: "multiply" (backwards compatible, consistent with limb-darkened integrator default). 
   */
  patchCombineMode?: PatchCombineMode;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDiskWithPatches: rStar must be a positive finite number.");
  }

  const occulters = sanitizeOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;
  if (anyOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  const patches = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";

  const gridRes = clampGridRes(params.gridRes, 220);

  const { totalIntensity, blockedIntensity } = integrateUniformSpottedDiskMidpoint({
    rStar,
    occulters,
    gridRes,
    patches,
    patchCombineMode,
  });

  // Pathological: factor==0 everywhere => totalIntensity==0. Avoid division by zero.
  if (!(Number.isFinite(totalIntensity) && totalIntensity > 0)) return 1.0;

  const flux = (totalIntensity - blockedIntensity) / totalIntensity;
  return clamp01(flux);
}
