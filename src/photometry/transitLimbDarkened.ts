// src/photometry/transitLimbDarkened.ts

//
// Generic limb-darkened stellar transit photometry (numerical, robust).
//
// This module integrates an arbitrary limb-darkening law I(mu)/I(1) over the projected stellar disk,
// with union masking by multiple circular occulters (planet+moon), plus optional brightness patches.
//
// Conventions:
// - Star is a projected disk of radius rStar centered at (0,0) in the sky plane.
// - Occulters are projected circles with center offsets (dx,dy) and radius r (same units).
// - mu = cos(theta) = sqrt(1 - (rho/R)^2), rho^2 = x^2 + y^2.
// - limbDarkeningLaw is interpreted as I(mu)/I(1) with I(1)=1 at disk center.
// - Output flux is normalized to the unocculted flux of the SAME limb-darkened star and patch map.
//
// Continuity / edge-case policy (must match transitUniform.ts and occulterCircle.ts):
// - Tangency is measure-zero.
// - Therefore point-in-occulter uses strict "<" (boundary does NOT count as blocked).
// - sanitizeCircleOcculters rejects d >= rStar + rOcc as "no overlap".

import type { BrightnessPatch } from "../core/types";
// Prefer the canonical single source of numeric helpers.
import { isFinitePositive } from "../core/units";
import type {
  LimbDarkeningConstraints,
  LimbDarkeningLaw,
} from "./limbDarkening";
import {
  intensityNonNegative,
  validateLimbDarkeningLaw,
} from "./limbDarkening";
// Avoid `import { type T }` mixed syntax to stay tooling-friendly.
import type { PatchCombineMode } from "./patches";
import { patchFactorAt, sanitizeBrightnessPatches } from "./patches";
import { integrateDiskMidpoint } from "./diskMidpoint";
import type { CircleOcculter } from "./occulterCircle";
import {
  anyCircleOcculterFullyCoversStar,
  clampGridRes,
  sanitizeCircleOcculters,
} from "./occulterCircle";

export type FluxLimbDarkenedDiskMeta = {
  earlyExit: boolean;
};

/**
 * Normalized flux for a limb-darkened stellar disk with circular occulters and optional
 * brightness patches (spots/faculae).
 *
 * Returns:
 * - flux in [0,1], where 1 is unobscured (relative to the same patchy star).
 * - meta.earlyExit indicates whether an approximation early-exit happened.
 */
export function fluxLimbDarkenedDiskDetailed(params: {
  rStar: number;
  rOcculters: CircleOcculter[];
  limbDarkeningLaw: LimbDarkeningLaw;
  brightnessPatches?: BrightnessPatch[];
  /** Resolution parameter for the disk integral; roughly samples across stellar diameter (y). */
  gridRes?: number;
  /** Optional: physical admissibility checks for coefficients. */
  constraints?: LimbDarkeningConstraints;
  /** Optional patch-combination policy (default "multiply"). */
  patchCombineMode?: PatchCombineMode;
  /** Optional early-exit tolerance for deep eclipses (default 0 = disabled). */
  earlyExitFluxEps?: number;
}): { flux: number; meta: FluxLimbDarkenedDiskMeta } {
  const rStar = params.rStar;

  if (!isFinitePositive(rStar)) {
    throw new Error(
      "fluxLimbDarkenedDisk: rStar must be a positive finite number."
    );
  }
  if (!params.limbDarkeningLaw) {
    throw new Error(
      "fluxLimbDarkenedDisk: limbDarkeningLaw must be provided."
    );
  }

  // Validate once per call (NOT per pixel).
  validateLimbDarkeningLaw(params.limbDarkeningLaw, params.constraints);

  // Single-source occulter handling + tangency policy.
  const occulters = sanitizeCircleOcculters(params.rStar, params.rOcculters);

  // Quick check: if no occulters overlap, flux is 1.0 (relative to patchy star).
  if (occulters.length === 0) {
    return { flux: 1.0, meta: { earlyExit: false } };
  }

  // Optimization: if any single occulter fully covers the star, flux is 0.
  // (Assuming non-negative patches; if patches are additive-negative, this is still 0).
  if (anyCircleOcculterFullyCoversStar(rStar, occulters)) {
    return { flux: 0.0, meta: { earlyExit: false } };
  }

  const patches = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";
  const gridRes = clampGridRes(params.gridRes, 60);

  const { total: totalIntensity, blocked: blockedIntensity, earlyExit } =
    integrateDiskMidpoint({
      rStar,
      occulters,
      gridRes,
      intensityAt: ({ x, y, mu }) => {
        const Ild = intensityNonNegative(mu, params.limbDarkeningLaw);
        if (Ild === 0) return 0;

        const Praw = patchFactorAt(x, y, patches, patchCombineMode);
        const P = Number.isFinite(Praw) ? Math.max(0, Praw) : 1;
        const I = Ild * P;
        return Number.isFinite(I) ? I : 0;
      },
      earlyExitFluxEps: params.earlyExitFluxEps ?? 0,
    });

  // Safe division: if totalIntensity is effectively zero (completely dark patches?), return 1.
  const flux =
    totalIntensity > 1e-12 ? 1 - blockedIntensity / totalIntensity : 1.0;

  return { flux: Math.max(0, flux), meta: { earlyExit } };
}
