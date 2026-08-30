/** Evaluates limb-darkening laws and validates their photometric admissibility. */

//
// Limb darkening laws, passband resolution, and optional physical admissibility checks.
//
// Goals:
// - Provide standard intensity laws I(mu)/I(1) for multiple parameterizations.
// - Support passband-dependent (multi-band) coefficient selection with deterministic fallback.
// - Provide configurable validation (none/warn/throw) for physical plausibility.
// - Provide a unified API surface: resolve -> validate -> evaluate.
//
// Scientific conventions:
// - mu = cos(theta) in [0,1], where mu=1 at disk center and mu=0 at the limb.
// - All laws here return intensity normalized to I(1)=1 (disk-center intensity).
//
// Implemented laws:
// - quadratic:
//     I(mu) = 1 - u1 (1 - mu) - u2 (1 - mu)^2
// - three-parameter ("nonlinear", reduced Claret form):
//     I(mu) = 1 - a1 (1 - mu^(1/2)) - a2 (1 - mu) - a3 (1 - mu^(3/2))
// - four-parameter (Claret):
//     I(mu) = 1 - a1 (1 - mu^(1/2)) - a2 (1 - mu) - a3 (1 - mu^(3/2)) - a4 (1 - mu^2)
//
// Notes:
// - Physical admissibility constraints are non-trivial; rather than relying on fragile closed-form
//   inequalities for every law, this module provides robust numerical checks over mu in [0,1].
// - Validation is designed to be called rarely (e.g. at config/preset updates), not per pixel.
// - Transit integrators clamp intensity to >=0 for robustness; validation is optional.

import { toFiniteNumber } from "../model/units";
import type {
  LimbDarkeningConstraints,
  LimbDarkeningLaw,
  LimbDarkeningModel,
  PassbandId,
  StellarLimbDarkeningParams,
} from "../model/types";
import { limbDarkeningBandShift } from "./limbDarkeningBands";
import { validateLimbDarkeningLaw } from "./limbDarkeningEvaluation";
import { findBandLaw, isLawObject, normalizeBandpassId } from "./limbDarkeningLookup";
export type { LimbDarkeningConstraints, LimbDarkeningLaw } from "../model/types";
export { intensityNonNegative, validateLimbDarkeningLaw } from "./limbDarkeningEvaluation";

export type StellarLdParams = StellarLimbDarkeningParams & { bandpass?: PassbandId };

export function hasExplicitLimbDarkeningBandLaw(
  model: LimbDarkeningModel | undefined,
  bandpass: unknown,
): boolean {
  return Boolean(model && findBandLaw(model.bands, bandpass));
}

/**
 * Deterministic, bounded quadratic-LD approximation from stellar parameters.
 * The mapping is intentionally conservative and used as a runtime fallback when no table is configured.
 */
export function deriveQuadraticLimbDarkeningFromStellarParams(
  params: StellarLdParams,
): Extract<LimbDarkeningLaw, { kind: "quadratic" }> {
  const teff = toFiniteNumber(params.teffK, 5772);
  const logg = toFiniteNumber(params.loggCgs, 4.44);
  const feh = toFiniteNumber(params.metallicityDex, 0);
  const band = normalizeBandpassId(params.bandpass ?? "v") ?? "v";

  // Smoothly varying toy coefficients around solar values.
  const tNorm = Math.max(-1, Math.min(1, (teff - 5772) / 4000));
  const gNorm = Math.max(-1, Math.min(1, (logg - 4.44) / 1.5));
  const zNorm = Math.max(-1, Math.min(1, feh / 1.0));
  const bandShift = limbDarkeningBandShift(band);

  let u1 = 0.42 - 0.14 * tNorm + 0.05 * gNorm + 0.03 * zNorm + bandShift;
  let u2 = 0.24 - 0.08 * tNorm + 0.03 * gNorm - 0.02 * zNorm + 0.5 * bandShift;
  u1 = Math.max(0, Math.min(1.3, u1));
  u2 = Math.max(0, Math.min(1.1, u2));
  if (u1 + u2 > 1.0) {
    const s = 1.0 / (u1 + u2);
    u1 *= s;
    u2 *= s;
  }

  return { kind: "quadratic", u1, u2 };
}

/** Validation behavior for limb-darkening plausibility checks. */
export type LimbDarkeningValidationMode = "none" | "warn" | "throw";

/**
 * Select a limb-darkening law for a given passband, with deterministic fallback.
 *
 * Fallback order:
 * 1) If bandpass is provided and model.bands[bandpass] exists, use it (case-insensitive).
 * 2) Else if model.bandpass exists and model.bands[model.bandpass] exists, use it.
 * 3) Otherwise, use model.default if present.
 * 4) Otherwise, return undefined.
 *
 * Edge-case behavior:
 * - If a band entry exists but is not a valid law object, it is ignored and fallback continues.
 * - Does not throw; caller can decide whether missing LD is an error.
 */
export function resolveLimbDarkeningForBand(
  model: LimbDarkeningModel,
  bandpass?: PassbandId,
): LimbDarkeningLaw | undefined {
  if (!model) return undefined;

  const bands = model.bands;

  const byExplicit = findBandLaw(bands, bandpass);
  if (byExplicit) return byExplicit;

  const byModel = findBandLaw(bands, model.bandpass);
  if (byModel) return byModel;

  const def = model.default;
  if (isLawObject(def)) return def;

  const stellar = model.stellar;
  const derived = deriveFromStellarParams(stellar, bandpass ?? model.bandpass);
  if (derived) return derived;

  return undefined;
}

/**
 * Unified helper: resolve a law for a band and apply validation (if configured on model.constraints).
 */
export function resolveAndValidateLimbDarkening(params: {
  model: LimbDarkeningModel;
  bandpass?: PassbandId;
}): LimbDarkeningLaw | undefined {
  const law = resolveLimbDarkeningForBand(params.model, params.bandpass);
  if (!law) return undefined;

  // Apply configured constraints if present on the model.
  validateLimbDarkeningLaw(law, params.model.constraints);

  return law;
}

/**
 * Resolve limb darkening for a specific star-like body.
 *
 * Resolution order:
 * 1) explicit per-band table entry for the star's passband (or model passband)
 * 2) derived quadratic law from merged stellar parameters, preferring star-specific values
 * 3) explicit model.default law
 * 4) model.stellar-derived fallback
 */
export function resolveAndValidateLimbDarkeningForStar(params: {
  model: LimbDarkeningModel;
  star?: StellarLdParams;
}): LimbDarkeningLaw | undefined {
  const { model, star } = params;
  const bandpass = star?.bandpass ?? model.bandpass;

  const byExplicitBand = findBandLaw(model.bands, bandpass);
  if (byExplicitBand) return validateResolvedLaw(byExplicitBand, model.constraints);

  const mergedStellar: StellarLdParams = {
    ...model.stellar,
    ...star,
    bandpass,
  };
  if (hasStellarDerivationInputs(mergedStellar)) {
    const derived = deriveQuadraticLimbDarkeningFromStellarParams(mergedStellar);
    return validateResolvedLaw(derived, model.constraints);
  }

  const def = model.default;
  if (isLawObject(def)) return validateResolvedLaw(def, model.constraints);

  const derived = deriveFromStellarParams(model.stellar, bandpass);
  return derived ? validateResolvedLaw(derived, model.constraints) : undefined;
}

function validateResolvedLaw(
  law: LimbDarkeningLaw,
  constraints: LimbDarkeningConstraints | undefined,
): LimbDarkeningLaw {
  validateLimbDarkeningLaw(law, constraints);
  return law;
}

function deriveFromStellarParams(
  stellar: StellarLimbDarkeningParams | undefined,
  bandpass: PassbandId | undefined,
): LimbDarkeningLaw | undefined {
  if (!stellar || typeof stellar !== "object") return undefined;
  return deriveQuadraticLimbDarkeningFromStellarParams({
    ...stellar,
    bandpass,
  });
}

function hasStellarDerivationInputs(stellar: StellarLimbDarkeningParams): boolean {
  return (
    Number.isFinite(stellar.teffK) ||
    Number.isFinite(stellar.loggCgs) ||
    Number.isFinite(stellar.metallicityDex)
  );
}
