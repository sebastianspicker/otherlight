// src/photometry/transitQuadraticLD.ts
//
// Quadratic limb-darkened stellar transit photometry (numerical, robust).
//
// Decision / architecture (no removals):
// - This remains a thin, backwards-compatible wrapper around the generic integrator in
//   transitLimbDarkened.ts. 
// - It should be kept ONLY as a convenience/compat entry-point and *not* as a separate integrator,
//   unless a proven, significantly faster, well-tested fast-path is implemented.
// - Current implementation delegates to fluxLimbDarkenedDisk(...), so it is not faster than generic;
//   thus it is effectively an API wrapper (recommended). 
//
// Scientific correctness / normalization:
// - Quadratic law: I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2, with I(1)=1 at disk center.
// - The generic integrator computes totalIntensity = ∫_disk I(mu)*P(x,y) dA and blockedIntensity over
//   the union of occulters, then returns (total - blocked)/total, ensuring correct disk-integrated
//   normalization even when limb darkening and patches are present. 
// - Intensity is clamped to be non-negative in limbDarkening.ts via intensityNonNegative(...),
//   preventing unphysical negative contributions from extreme coefficients. 
//


import type { BrightnessPatch, LimbDarkeningQuadratic } from "../core/types";
import type { Occulter } from "./transitUniform";

import type { LimbDarkeningLaw } from "./limbDarkening";
import { fluxLimbDarkenedDisk } from "./transitLimbDarkened";

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function isFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

/**
 * Ensure coefficients are finite. We do not strictly enforce physical admissibility here,
 * but keep values within a broad range to avoid extreme pathological cases.
 *
 * Physical plausibility and safety are ensured by:
 * - optional validateLimbDarkeningLaw(...) inside the generic integrator when constraints are passed
 * - always clamping I(mu) >= 0 via intensityNonNegative(...) in limbDarkening.ts. 
 *
 * NOTE:
 * - The broad clamp range is preserved for backwards compatibility.
 * - If stricter behavior is desired, pass constraints via transitLimbDarkened.ts entry-point directly. 
 */
function sanitizeQuadraticLD(ld: LimbDarkeningQuadratic): LimbDarkeningQuadratic {
  const u1 = Number.isFinite(ld?.u1) ? ld.u1 : 0;
  const u2 = Number.isFinite(ld?.u2) ? ld.u2 : 0;

  return {
    u1: clamp(u1, -2, 2),
    u2: clamp(u2, -2, 2),
  };
}

/**
 * Normalized flux for a quadratic limb-darkened stellar disk with circular occulters
 * and optional brightness patches (spots/faculae).
 *
 * Returns F in [0,1], where 1 is unobscured (relative to the same patchy star).
 *
 * Backwards-compatibility notes:
 * - Signature is unchanged.
 * - Behavior remains deterministic and robust.
 * - Internally delegates to the generic limb-darkened integrator to avoid duplication. 
 */
export function fluxLimbDarkenedDiskQuadratic(params: {
  rStar: number;
  rOcculters: Occulter[];
  limbDarkening: LimbDarkeningQuadratic;
  brightnessPatches?: BrightnessPatch[];
  /**
   * Resolution parameter for the disk integral.
   * Roughly corresponds to samples across the stellar diameter in y-direction.
   */
  gridRes?: number;
}): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) {
    throw new Error("fluxLimbDarkenedDiskQuadratic: rStar must be a positive finite number.");
  }
  if (!params.limbDarkening) {
    throw new Error("fluxLimbDarkenedDiskQuadratic: limbDarkening must be provided.");
  }

  const ld = sanitizeQuadraticLD(params.limbDarkening);

  // Quadratic law normalized to I(1)=1 (disk center). The generic integrator normalizes to the
  // disk-integrated flux of this same law (and patches), so the returned F is physically correct. 
  const law: LimbDarkeningLaw = { kind: "quadratic", u1: ld.u1, u2: ld.u2 };

  return fluxLimbDarkenedDisk({
    rStar,
    rOcculters: params.rOcculters ?? [],
    limbDarkeningLaw: law,
    brightnessPatches: params.brightnessPatches,
    gridRes: params.gridRes,
    // No explicit constraints here to preserve legacy “soft” behavior; callers that want strict
    // physics checks should call fluxLimbDarkenedDisk(...) directly with constraints. 
  });
}
