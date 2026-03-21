// src/photometry/limbDarkening.ts

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

import { clamp01, toFiniteNumber } from "../core/units";
import type {
  LimbDarkeningConstraints,
  LimbDarkeningLaw,
  LimbDarkeningModel,
  PassbandId,
  StellarLimbDarkeningParams,
} from "../core/types";
export type { LimbDarkeningConstraints, LimbDarkeningLaw } from "../core/types";

export type StellarLdParams = StellarLimbDarkeningParams & { bandpass?: PassbandId };

/**
 * Deterministic, bounded quadratic-LD approximation from stellar parameters.
 * The mapping is intentionally conservative and used as a runtime fallback when no table is configured.
 */
export function deriveQuadraticLimbDarkeningFromStellarParams(
  params: StellarLdParams,
): Extract<LimbDarkeningLaw, { kind: "quadratic" }> {
  const teff = Number.isFinite(params.teffK) ? (params.teffK as number) : 5772;
  const logg = Number.isFinite(params.loggCgs) ? (params.loggCgs as number) : 4.44;
  const feh = Number.isFinite(params.metallicityDex) ? (params.metallicityDex as number) : 0;
  const band = normalizeBandpassId(params.bandpass ?? "v") ?? "v";

  // Smoothly varying toy coefficients around solar values.
  const tNorm = Math.max(-1, Math.min(1, (teff - 5772) / 4000));
  const gNorm = Math.max(-1, Math.min(1, (logg - 4.44) / 1.5));
  const zNorm = Math.max(-1, Math.min(1, feh / 1.0));
  const bandShift =
    band === "u" || band === "b"
      ? 0.06
      : band === "r" || band === "i" || band === "z" || band === "y"
        ? -0.05
        : 0;

  let u1 = 0.42 - 0.14 * tNorm + 0.05 * gNorm + 0.03 * zNorm + bandShift;
  let u2 = 0.24 - 0.08 * tNorm + 0.03 * gNorm - 0.02 * zNorm + 0.5 * bandShift;
  u1 = Math.max(0, Math.min(1.3, u1));
  u2 = Math.max(0, Math.min(1.1, u2));
  if (u1 + u2 >= 1.95) {
    const s = 1.95 / (u1 + u2);
    u1 *= s;
    u2 *= s;
  }

  return { kind: "quadratic", u1, u2 };
}

/** Validation behavior for limb-darkening plausibility checks. */
export type LimbDarkeningValidationMode = "none" | "warn" | "throw";

function emitValidation(mode: LimbDarkeningValidationMode, msg: string): void {
  if (mode === "none") return;
  if (mode === "throw") throw new Error(msg);
  // mode === "warn"
  console.warn(msg);
}

function isFiniteLaw(law: LimbDarkeningLaw): boolean {
  switch (law.kind) {
    case "quadratic":
      return Number.isFinite(law.u1) && Number.isFinite(law.u2);
    case "three-parameter":
      return Number.isFinite(law.a1) && Number.isFinite(law.a2) && Number.isFinite(law.a3);
    case "four-parameter":
      return (
        Number.isFinite(law.a1) &&
        Number.isFinite(law.a2) &&
        Number.isFinite(law.a3) &&
        Number.isFinite(law.a4)
      );
    default: {
      const _never: never = law;
      return _never;
    }
  }
}

function normalizeBandpassId(id: unknown): PassbandId | undefined {
  if (id === undefined || id === null) return undefined;
  const s = String(id).trim();
  if (!s) return undefined;
  return s.toLowerCase();
}

function isLawObject(candidate: unknown): candidate is LimbDarkeningLaw {
  return Boolean(
    candidate && typeof candidate === "object" && "kind" in candidate && typeof candidate.kind === "string",
  );
}

function findBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw> | undefined,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  if (!bands) return undefined;

  const raw = bandpass === undefined || bandpass === null ? "" : String(bandpass);
  if (raw && Object.prototype.hasOwnProperty.call(bands, raw)) {
    const candidate = bands[raw as PassbandId];
    if (isLawObject(candidate)) return candidate;
  }

  const norm = normalizeBandpassId(raw);
  if (!norm) return undefined;

  if (Object.prototype.hasOwnProperty.call(bands, norm)) {
    const candidate = bands[norm as PassbandId];
    if (isLawObject(candidate)) return candidate;
  }

  for (const key of Object.keys(bands)) {
    if (normalizeBandpassId(key) === norm) {
      const candidate = bands[key as PassbandId];
      if (isLawObject(candidate)) return candidate;
    }
  }

  return undefined;
}

/**
 * Evaluate normalized specific intensity I(mu)/I(1) for the given limb-darkening law.
 *
 * Robustness:
 * - mu is clamped to [0,1].
 * - If coefficients are non-finite, the result may be non-finite (caller may validate/sanitize).
 */
function evaluateLimbDarkeningIntensity(mu: number, law: LimbDarkeningLaw): number {
  const m = clamp01(mu);

  switch (law.kind) {
    case "quadratic": {
      const oneMinus = 1 - m;
      return 1 - law.u1 * oneMinus - law.u2 * oneMinus * oneMinus;
    }
    case "three-parameter": {
      const s = Math.sqrt(m); // mu^(1/2)
      const m32 = m * s; // mu^(3/2)
      return 1 - law.a1 * (1 - s) - law.a2 * (1 - m) - law.a3 * (1 - m32);
    }
    case "four-parameter": {
      const s = Math.sqrt(m); // mu^(1/2)
      const m32 = m * s; // mu^(3/2)
      const m2 = m * m; // mu^2
      return 1 - law.a1 * (1 - s) - law.a2 * (1 - m) - law.a3 * (1 - m32) - law.a4 * (1 - m2);
    }
    default: {
      const _never: never = law;
      return _never;
    }
  }
}

/**
 * Convenience helper used by integrators:
 * - clamps mu to [0,1] (via evaluate)
 * - clamps intensity to >= 0
 * - returns 0 for non-finite results
 */
export function intensityNonNegative(mu: number, law: LimbDarkeningLaw): number {
  const I = evaluateLimbDarkeningIntensity(mu, law);
  if (!Number.isFinite(I)) return 0;
  return Math.max(0, I);
}

/**
 * Validate a limb-darkening law against configurable plausibility constraints.
 *
 * NOTE:
 * - Intended to be called rarely (e.g. at config updates), not per sample point.
 */
export function validateLimbDarkeningLaw(
  law: LimbDarkeningLaw,
  constraints?: LimbDarkeningConstraints,
): void {
  const mode: LimbDarkeningValidationMode = constraints?.mode ?? "none";
  if (mode === "none") return;

  if (!isFiniteLaw(law)) {
    emitValidation(mode, `Limb darkening coefficients must be finite (law=${law.kind}).`);
    return;
  }

  const muSamples = Math.max(8, Math.floor(toFiniteNumber(constraints?.muSamples, 64)));
  const eps = Math.max(0, toFiniteNumber(constraints?.eps, 1e-12));
  const requireNonNeg = constraints?.nonNegativeIntensity ?? true;
  const requireMono = constraints?.monotoneIncreasingWithMu ?? false;
  const maxI = toFiniteNumber(constraints?.maxIntensity, Number.POSITIVE_INFINITY);

  const I1 = evaluateLimbDarkeningIntensity(1, law);
  if (!(Number.isFinite(I1) && Math.abs(I1 - 1) <= 1e-10)) {
    emitValidation(mode, `Limb darkening law ${law.kind} does not satisfy I(1)=1 (got ${I1}).`);
  }

  let prevI: number | undefined;

  for (let i = 0; i <= muSamples; i++) {
    const mu = i / muSamples;
    const I = evaluateLimbDarkeningIntensity(mu, law);

    if (!Number.isFinite(I)) {
      emitValidation(mode, `Limb darkening produced non-finite intensity at mu=${mu} (law=${law.kind}).`);
      break;
    }

    if (requireNonNeg && I < -eps) {
      emitValidation(
        mode,
        `Limb darkening violates non-negative intensity: I(mu) < 0 at mu=${mu.toFixed(
          6,
        )} (I=${I}) (law=${law.kind}).`,
      );
      break;
    }

    if (I > maxI + eps) {
      emitValidation(
        mode,
        `Limb darkening exceeds maxIntensity at mu=${mu.toFixed(6)} (I=${I}, max=${maxI}) (law=${law.kind}).`,
      );
      break;
    }

    if (requireMono && prevI !== undefined) {
      if (I + eps < prevI) {
        emitValidation(
          mode,
          `Limb darkening violates monotonicity at mu=${mu.toFixed(
            6,
          )} (I=${I} < prev=${prevI}) (law=${law.kind}).`,
        );
        break;
      }
    }
    prevI = I;
  }
}

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
  if (stellar && typeof stellar === "object") {
    return deriveQuadraticLimbDarkeningFromStellarParams({
      ...stellar,
      bandpass: bandpass ?? model.bandpass,
    });
  }

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
