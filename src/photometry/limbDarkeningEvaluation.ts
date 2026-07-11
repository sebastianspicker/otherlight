import type { LimbDarkeningConstraints, LimbDarkeningLaw } from "../core/types";
import { clamp01, toFiniteNumber } from "../core/units";

type LimbDarkeningValidationMode = "none" | "warn" | "throw";

type ResolvedLimbDarkeningConstraints = {
  mode: LimbDarkeningValidationMode;
  muSamples: number;
  eps: number;
  requireNonNeg: boolean;
  requireMono: boolean;
  maxI: number;
};

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
  const resolved = resolveLimbDarkeningConstraints(constraints);
  if (!resolved) return;

  if (!isFiniteLaw(law)) {
    emitValidation(resolved.mode, `Limb darkening coefficients must be finite (law=${law.kind}).`);
    return;
  }

  validateDiskCenterIntensity(law, resolved);
  validateIntensitySamples(law, resolved);
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

function emitValidation(mode: LimbDarkeningValidationMode, msg: string): void {
  if (mode === "none") return;
  if (mode === "throw") throw new Error(msg);
  // mode === "warn"
  console.warn(msg);
}

function isFiniteLaw(law: LimbDarkeningLaw): boolean {
  return finiteLawCoefficients(law).every(Number.isFinite);
}

function finiteLawCoefficients(law: LimbDarkeningLaw): number[] {
  switch (law.kind) {
    case "quadratic":
      return [law.u1, law.u2];
    case "three-parameter":
      return [law.a1, law.a2, law.a3];
    case "four-parameter":
      return [law.a1, law.a2, law.a3, law.a4];
    default: {
      const _never: never = law;
      return _never;
    }
  }
}

function resolveLimbDarkeningConstraints(
  constraints?: LimbDarkeningConstraints,
): ResolvedLimbDarkeningConstraints | undefined {
  const mode: LimbDarkeningValidationMode = constraints?.mode ?? "none";
  if (mode === "none") return undefined;

  return {
    mode,
    muSamples: Math.max(8, Math.floor(toFiniteNumber(constraints?.muSamples, 64))),
    eps: Math.max(0, toFiniteNumber(constraints?.eps, 1e-12)),
    requireNonNeg: constraints?.nonNegativeIntensity ?? true,
    requireMono: constraints?.monotoneIncreasingWithMu ?? false,
    maxI: toFiniteNumber(constraints?.maxIntensity, Number.POSITIVE_INFINITY),
  };
}

function validateDiskCenterIntensity(
  law: LimbDarkeningLaw,
  constraints: ResolvedLimbDarkeningConstraints,
): void {
  const I1 = evaluateLimbDarkeningIntensity(1, law);
  if (Number.isFinite(I1) && Math.abs(I1 - 1) <= 1e-10) return;
  emitValidation(constraints.mode, `Limb darkening law ${law.kind} does not satisfy I(1)=1 (got ${I1}).`);
}

function validateIntensitySamples(
  law: LimbDarkeningLaw,
  constraints: ResolvedLimbDarkeningConstraints,
): void {
  let prevI: number | undefined;
  for (let i = 0; i <= constraints.muSamples; i++) {
    const mu = i / constraints.muSamples;
    const I = evaluateLimbDarkeningIntensity(mu, law);
    const sampleIssue = limbDarkeningSampleIssue(law, constraints, mu, I, prevI);
    if (sampleIssue) {
      emitValidation(constraints.mode, sampleIssue);
      break;
    }
    prevI = I;
  }
}

function limbDarkeningSampleIssue(
  law: LimbDarkeningLaw,
  constraints: ResolvedLimbDarkeningConstraints,
  mu: number,
  I: number,
  prevI: number | undefined,
): string | undefined {
  if (!Number.isFinite(I)) {
    return `Limb darkening produced non-finite intensity at mu=${mu} (law=${law.kind}).`;
  }

  if (constraints.requireNonNeg && I < -constraints.eps) {
    return `Limb darkening violates non-negative intensity: I(mu) < 0 at mu=${mu.toFixed(
      6,
    )} (I=${I}) (law=${law.kind}).`;
  }

  if (I > constraints.maxI + constraints.eps) {
    return `Limb darkening exceeds maxIntensity at mu=${mu.toFixed(6)} (I=${I}, max=${constraints.maxI}) (law=${
      law.kind
    }).`;
  }

  if (constraints.requireMono && prevI !== undefined && I + constraints.eps < prevI) {
    return `Limb darkening violates monotonicity at mu=${mu.toFixed(
      6,
    )} (I=${I} < prev=${prevI}) (law=${law.kind}).`;
  }

  return undefined;
}
