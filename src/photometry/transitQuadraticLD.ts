// src/photometry/transitQuadraticLD.ts
//
// Quadratic limb-darkened stellar transit photometry (numerical, robust).
//
// Architecture:
// - Thin wrapper around the generic integrator in transitLimbDarkened.ts.
// - Intentionally does not duplicate integration logic.
//
// IMPORTANT "soft wrapper" policy:
// - This module is intentionally permissive: it clamps coefficients into a broad range
//   to keep the simulation stable for UI sliders / legacy presets.
// - This does NOT guarantee physical admissibility of the quadratic coefficients.
// - If you need physical plausibility enforcement (e.g. non-negative intensity across mu ∈ [0,1]),
//   pass `constraints` below (or call fluxLimbDarkenedDisk(...) directly).
//
// Scientific correctness / normalization:
// - Quadratic law: I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2, with I(1)=1 at disk center.
// - The generic integrator normalizes to the unocculted flux of the same (possibly patchy) star.

import type { BrightnessPatch, LimbDarkeningConstraints, LimbDarkeningLawQuadratic } from "../core/types";
import { clamp, isFinitePositive } from "../core/units";

import type { LimbDarkeningLaw } from "./limbDarkening";
import { fluxLimbDarkenedDiskDetailed } from "./transitLimbDarkened";

import type { CircleOcculter } from "./occulterCircle";

/**
 * Sanitize quadratic LD coefficients for "soft" usage.
 *
 * Notes:
 * - Coefficients are clamped to a deliberately wide interval to prevent numerical pathologies.
 * - This is not a physical admissibility check.
 * - For strict validation, use the `constraints` pass-through (which calls validateLimbDarkeningLaw).
 */
function sanitizeQuadraticLD(ld: LimbDarkeningLawQuadratic): LimbDarkeningLawQuadratic {
  const u1 = Number.isFinite(ld?.u1) ? (ld.u1 as number) : 0;
  const u2 = Number.isFinite(ld?.u2) ? (ld.u2 as number) : 0;

  return {
    kind: "quadratic",
    u1: clamp(u1, -2, 2),
    u2: clamp(u2, -2, 2),
  };
}

/**
 * Normalized flux for a quadratic limb-darkened stellar disk with circular occulters
 * and optional brightness patches (spots/faculae).
 *
 * Returns F in [0,1], where 1 is unobscured (relative to the same patchy star).
 */
export function fluxLimbDarkenedDiskQuadratic(params: {
  rStar: number;
  rOcculters: CircleOcculter[];
  limbDarkening: LimbDarkeningLawQuadratic;
  brightnessPatches?: BrightnessPatch[];
  /** Resolution parameter for the disk integral; roughly samples across the stellar diameter (y). */
  gridRes?: number;

  /**
   * Optional: request physical plausibility checks for the selected coefficients.
   * - mode: "none" | "warn" | "throw"
   * - See core/types.ts for available checks.
   *
   * If omitted, this wrapper keeps legacy "soft" behavior (no strict validation).
   */
  constraints?: LimbDarkeningConstraints;
}): number {
  const rStar = params.rStar;

  if (!isFinitePositive(rStar)) {
    throw new Error("fluxLimbDarkenedDiskQuadratic: rStar must be a positive finite number.");
  }
  if (!params.limbDarkening) {
    throw new Error("fluxLimbDarkenedDiskQuadratic: limbDarkening must be provided.");
  }

  // Soft sanitize.
  const q = sanitizeQuadraticLD(params.limbDarkening);

  // Feed into the generic integrator.
  const law: LimbDarkeningLaw = { kind: "quadratic", u1: q.u1, u2: q.u2 };

  // Note: we use the detailed version internally but return only the flux number
  // to match the simpler exported signature.
  const result = fluxLimbDarkenedDiskDetailed({
    rStar,
    rOcculters: params.rOcculters ?? [],
    limbDarkeningLaw: law,
    brightnessPatches: params.brightnessPatches,
    gridRes: params.gridRes,
    constraints: params.constraints,
  });

  return result.flux;
}

// Backwards-compat: keep the old exported name if any code imported Occulter indirectly.
export type Occulter = CircleOcculter;
