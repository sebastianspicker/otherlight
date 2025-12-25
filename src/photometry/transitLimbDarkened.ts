// src/photometry/transitLimbDarkened.ts
//
// Generic limb-darkened stellar transit photometry (numerical, robust).
//
// This module generalizes src/photometry/transitQuadraticLD.ts by integrating an arbitrary
// limb-darkening law I(mu)/I(1) (provided by limbDarkening.ts), while retaining the same
// numerical philosophy:
// - deterministic midpoint integration over a chord-based grid on the stellar disk
// - union of multiple circular occulters (planet+moon), "blocked if inside ANY occulter"
// - optional projected brightness patches (spots/faculae) applied as a projected brightness map
// - robust input validation and safe clamping of output flux into [0,1]
//
// Scientific conventions / disk integration:
// - Star is a projected disk of radius rStar centered at (0,0) in the sky plane. 
// - Occulters are projected circles with center offsets (dx,dy) and radius r (same units). 
// - mu = cos(theta) = sqrt(1 - (rho/R)^2), rho^2 = x^2 + y^2. 
// - limbDarkeningLaw is interpreted as I(mu)/I(1) with I(1)=1 at disk center. 
// - Integration is over projected area elements dA = dx*dy in the sky plane; totalIntensity is
//   the disk-integrated (projected) flux under that I(mu) convention and patch map. 
// - Returned flux is normalized to the unocculted flux of the SAME limb-darkened star and patch map. 
//
// Brightness patches (model assumption):
// - Patches are 2D masks on the projected stellar disk multiplying local intensity by a factor. 
// - Default combine policy is "multiply" (stacked contrast maps), matching existing behavior. 
// - Alternative policies ("max", "overrideLast") are provided as an option.
//
// Performance notes:
// - The hot path is O(Ncells * Nocculters). 
// - Adds a cheap y-row intersection filter and x-range reject per occulter to reduce distance checks.
// - Default gridRes remains 220 for compatibility. 
//

import type { BrightnessPatch } from "../core/types";
import type { Occulter } from "./transitUniform";
import type { LimbDarkeningConstraints, LimbDarkeningLaw } from "./limbDarkening";

import { intensityNonNegative, validateLimbDarkeningLaw } from "./limbDarkening";
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

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

/**
 * Sanitize occulters:
 * - remove NaNs/infs
 * - require r > 0
 * - quick reject those that cannot overlap the stellar disk in projection
 */
function sanitizeOcculters(rStar: number, occulters: Occulter[]): Occulter[] {
  const out: Occulter[] = [];
  for (const o of occulters ?? []) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy) || !isFinitePositive(o.r)) continue;

    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;

    // Tangency is measure-zero; treat as no-overlap to reduce edge jitter.
    if (d >= rStar + o.r) continue;

    out.push(o);
  }
  return out;
}

/**
 * Returns true if any occulter fully covers the stellar disk in projection.
 * If so, normalized stellar flux is 0 (up to numerical tolerance).
 */
function anyOcculterFullyCoversStar(rStar: number, occulters: Occulter[]): boolean {
  for (const o of occulters) {
    const d = Math.hypot(o.dx, o.dy);
    if (!Number.isFinite(d)) continue;

    // Star disk is fully inside occulter disk if d + rStar <= rOcc.
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
 * Deterministic midpoint integration over the stellar disk to compute:
 * - totalIntensity: ∫_star I(mu)*P(x,y) dA
 * - blockedIntensity: ∫_{star ∩ union(occulters)} I(mu)*P(x,y) dA
 */
function integrateLimbDarkenedDiskMidpoint(params: {
  rStar: number;
  occulters: Occulter[];
  gridRes: number;
  limbDarkeningLaw: LimbDarkeningLaw;
  patches: PatchPre[];
  patchCombineMode: PatchCombineMode;
  earlyExitFluxEps: number;
}): { totalIntensity: number; blockedIntensity: number } {
  const { rStar, occulters, gridRes, limbDarkeningLaw, patches, patchCombineMode, earlyExitFluxEps } = params;

  const ny = Math.max(40, Math.floor(gridRes));
  const nx = ny;

  const rStar2 = rStar * rStar;
  const dy = (2 * rStar) / ny;

  const occ: OcculterPre[] = occulters.map((o) => ({ dx: o.dx, dy: o.dy, r: o.r, r2: o.r * o.r }));

  let totalIntensity = 0;
  let blockedIntensity = 0;

  for (let iy = 0; iy < ny; iy++) {
    const y = -rStar + (iy + 0.5) * dy;
    const y2 = y * y;

    // Star chord half-length at this y.
    const xMaxStar = Math.sqrt(Math.max(0, rStar2 - y2));
    if (!(xMaxStar > 0)) continue;

    const dxCell = (2 * xMaxStar) / nx;
    const cellArea = dxCell * dy;

    // Precompute occulters that intersect this y-row and their x-interval (cheap reject).
    const occRow: Array<{ xMin: number; xMax: number; dx: number; dy: number; r2: number }> = [];
    for (const o of occ) {
      const dyo = y - o.dy;
      if (Math.abs(dyo) > o.r) continue;
      const xHalf = Math.sqrt(Math.max(0, o.r2 - dyo * dyo));
      occRow.push({ xMin: o.dx - xHalf, xMax: o.dx + xHalf, dx: o.dx, dy: o.dy, r2: o.r2 });
    }

    for (let ix = 0; ix < nx; ix++) {
      const x = -xMaxStar + (ix + 0.5) * dxCell;
      const rho2 = x * x + y2;

      // mu = sqrt(1 - rho^2 / R^2) for points on the projected disk. 
      const mu = Math.sqrt(Math.max(0, 1 - rho2 / rStar2));

      const Ild = intensityNonNegative(mu, limbDarkeningLaw);
      const P = patchFactorAt(x, y, patches, patchCombineMode);

      const dI = Ild * P * cellArea;
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

    // Optional early exit when flux is effectively zero (disabled by default).
    if (earlyExitFluxEps > 0 && totalIntensity > 0) {
      const remaining = (totalIntensity - blockedIntensity) / totalIntensity;
      if (remaining <= earlyExitFluxEps) break;
    }
  }

  if (!Number.isFinite(totalIntensity)) totalIntensity = 0;
  if (!Number.isFinite(blockedIntensity)) blockedIntensity = 0;

  totalIntensity = Math.max(0, totalIntensity);
  blockedIntensity = clamp(blockedIntensity, 0, totalIntensity);

  return { totalIntensity, blockedIntensity };
}

/**
 * Normalized flux for a limb-darkened stellar disk with circular occulters and optional
 * brightness patches (spots/faculae).
 *
 * Returns F in [0,1], where 1 is unobscured (relative to the same patchy star). 
 */
export function fluxLimbDarkenedDisk(params: {
  rStar: number;
  rOcculters: Occulter[];
  limbDarkeningLaw: LimbDarkeningLaw;
  brightnessPatches?: BrightnessPatch[];
  /**
   * Resolution parameter for the disk integral.
   * Roughly corresponds to samples across the stellar diameter in y-direction.
   */
  gridRes?: number;
  /**
   * Optional: physical admissibility checks for coefficients.
   * If omitted, no validation is performed here (but intensity is still clamped to >=0). 
   */
  constraints?: LimbDarkeningConstraints;
  /**
   * Optional patch-combination policy.
   * Default: "multiply" (backwards compatible; consistent with patches helper default usage). 
   */
  patchCombineMode?: PatchCombineMode;
  /**
   * Optional early-exit tolerance for deep eclipses.
   * If set (e.g. 1e-6), integration can stop once remaining flux fraction is <= eps.
   * Default: 0 (disabled) for strict compatibility.
   */
  earlyExitFluxEps?: number;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxLimbDarkenedDisk: rStar must be a positive finite number.");
  }
  if (!params.limbDarkeningLaw) {
    throw new Error("fluxLimbDarkenedDisk: limbDarkeningLaw must be provided.");
  }

  // Validate once per call (NOT per pixel). 
  validateLimbDarkeningLaw(params.limbDarkeningLaw, params.constraints);

  const occulters = sanitizeOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;
  if (anyOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  // Shared patch sanitization ensures consistency with uniform+spots integrator. 
  const patches = sanitizeBrightnessPatches(params.brightnessPatches);

  const gridRes = clampGridRes(params.gridRes, 220);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";
  const earlyExitFluxEps = isFiniteNonNegative(params.earlyExitFluxEps) ? params.earlyExitFluxEps : 0;

  const { totalIntensity, blockedIntensity } = integrateLimbDarkenedDiskMidpoint({
    rStar,
    occulters,
    gridRes,
    limbDarkeningLaw: params.limbDarkeningLaw,
    patches,
    patchCombineMode,
    earlyExitFluxEps,
  });

  // If totalIntensity is zero (e.g. patches factor=0 everywhere), avoid division by zero.
  if (!(Number.isFinite(totalIntensity) && totalIntensity > 0)) return 1.0;

  const flux = (totalIntensity - blockedIntensity) / totalIntensity;
  return clamp01(flux);
}
