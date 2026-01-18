// src/photometry/transitUniformSpots.ts
//
// Uniform-brightness stellar disk transit photometry with stellar spots/faculae,
// using deterministic midpoint integration over the stellar disk.
//
// Scientific model (simple but useful):
// - The star has uniform baseline specific intensity I0 across its disk.
// - Brightness patches (spots/faculae) multiply local intensity by a factor f(x,y) >= 0.
// - Occulters are opaque circular disks blocking projected light.
//
// Returned quantity:
// - Normalized stellar flux factor F in [0,1], normalized to the *same patched star without occulters*,
//   so F = 1 out of transit for any patch map.

import type { BrightnessPatch } from "../core/types";
import { clamp01, isFinitePositive } from "../core/units";

import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode } from "./patches";
import { integrateDiskMidpoint } from "./diskMidpoint";

import {
  anyCircleOcculterFullyCoversStar,
  clampGridRes,
  sanitizeCircleOcculters,
  type CircleOcculter,
} from "./occulterCircle";


/**
 * Normalized flux for a uniform-brightness stellar disk with brightness patches (spots/faculae)
 * and circular occulters.
 *
 * Returns F in [0,1], where 1 is unobscured relative to the same patchy star.
 */
export function fluxUniformDiskWithPatches(params: {
  rStar: number;
  rOcculters: CircleOcculter[];
  brightnessPatches?: BrightnessPatch[];
  /**
   * Resolution parameter for the disk integral.
   * Roughly corresponds to samples across the stellar diameter in y-direction.
   */
  gridRes?: number;
  /**
   * Patch-combination policy (optional).
   * Default: "multiply" (backwards compatible).
   */
  patchCombineMode?: PatchCombineMode;
}): number {
  const rStar = params.rStar;

  if (!isFinitePositive(rStar)) {
    throw new Error("fluxUniformDiskWithPatches: rStar must be a positive finite number.");
  }

  // Single-source occulter handling.
  const occulters = sanitizeCircleOcculters(rStar, params.rOcculters ?? []);
  if (occulters.length === 0) return 1.0;

  if (anyCircleOcculterFullyCoversStar(rStar, occulters)) return 0.0;

  // Shared patch sanitization.
  const patches = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";

  const gridRes = clampGridRes(params.gridRes, 220);

  const { total: totalIntensity, blocked: blockedIntensity } = integrateDiskMidpoint({
    rStar,
    occulters,
    gridRes,
    intensityAt: ({ x, y }) => {
      const I = patchFactorAt(x, y, patches, patchCombineMode);
      return Number.isFinite(I) ? Math.max(0, I) : 1;
    },
    earlyExitFluxEps: 0,
  });

  // Pathological: factor==0 everywhere => totalIntensity==0. Avoid division by zero.
  if (!(Number.isFinite(totalIntensity) && totalIntensity > 0)) return 1.0;

  const flux = (totalIntensity - blockedIntensity) / totalIntensity;
  return clamp01(flux);
}

// Backwards-compat: keep the old exported name if other modules import it as Occulter.
export type Occulter = CircleOcculter;
