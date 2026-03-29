// src/photometry/forwardScattering.ts

//
// Forward-scattering "pre/post transit brightening" toy models.
//
// Purpose
// - Provide an additive flux component (in stellar flux units) that can increase the observed flux
//   near transit due to strongly forward-scattering aerosols/dust/haze.
// - This is complementary to transmission/absorption (multiplicative dimming) handled elsewhere.
//
// Scientific notes (minimal but physically grounded)
// - Forward scattering is often parameterized by an anisotropic phase function.
// - A common analytic approximation for single-scattering angular distribution is the
//   Henyey–Greenstein (HG) phase function with asymmetry parameter g in (-1,1),
//   where g>0 is forward-peaked. (Normalized over 4π steradians.)
// - Real transit forward-scattering depends on dust distribution, optical depth, and star's finite angular size.
//   This file intentionally uses robust phenomenological models suitable for interactive simulation.
//
// Design goals
// - Plain-data friendly: the model is specified by numbers and enums.
// - Safe numerics: clamps and guards against NaN/Inf.
// - Backwards compatible: if disabled or missing parameters, returns 0.
//
// Units
// - All outputs are additive flux in "stellar units" (baseline star ~ 1).
// - Geometry uses vectors in the simulation's length units; only directions/angles matter here.

import type { Vec3 } from "../physics/vec3";
import { vDot, vNormalizeOrThrow, vIsFinite } from "../physics/vec3";
import { clamp, isFiniteNumber } from "../core/units";

export type ForwardScatteringModel = {
  enabled?: boolean;

  /**
   * Amplitude scaling in stellar units.
   * Interpreted as a dimensionless additive contribution.
   *
   * Typical order-of-magnitude targets for toy usage: 1e-6 .. 1e-2.
   */
  amp?: number;

  /**
   * Model selection.
   * - "hg-angle": uses HG phase function evaluated at an approximate scattering angle.
   * - "gaussian-time": purely phenomenological peaks around a specified phase center.
   *
   * Default: "hg-angle".
   */
  kind?: "hg-angle" | "gaussian-time";

  /**
   * HG asymmetry parameter g in [-0.999, 0.999].
   * Larger g -> more forward-peaked scattering.
   *
   * Only used for kind="hg-angle".
   */
  g?: number;

  /**
   * Width of the brightening feature in radians of orbital phase (toy).
   * Smaller -> sharper spike.
   *
   * Used by both kinds:
   * - For "hg-angle": used as a softening width around exact forward direction.
   * - For "gaussian-time": standard deviation of the Gaussian in phase.
   */
  sigmaPhase?: number;

  /**
   * Optional phase offset in radians.
   * Allows shifting the brightening peak away from nominal transit alignment.
   *
   * Used by "gaussian-time"; for "hg-angle" it is applied as a phase tweak as well.
   */
  phaseOffset?: number;

  /**
   * If true (default), clamps the returned flux to be non-negative and finite.
   * Forward scattering should usually be >= 0 in a toy additive model.
   */
  clampNonNegative?: boolean;

  /**
   * If true (default), apply a behind-the-star gate:
   * - if the body is behind the star relative to the observer, return 0.
   * This prevents non-physical brightening during secondary eclipse in a minimal model.
   *
   * NOTE: This is a geometric sign check using dot(rBody, observerDir).
   * Toy Model Assumption: scattering disabled in entire rear hemisphere.
   */
  gateWhenBehindStar?: boolean;
};

export type ForwardScatteringFluxParams = {
  /**
   * Position vector of the scattering body relative to the star, in inertial coordinates.
   * Only direction matters here.
   */
  rBody: Vec3;

  /**
   * Observer direction (points from star toward observer), consistent with sim.ts.
   * Does not need to be normalized; it will be normalized here.
   */
  observerDir: Vec3;

  /**
   * Scattering model parameters.
   */
  model?: ForwardScatteringModel;

  /**
   * Optional orbital phase in radians (for purely phenomenological models).
   * Phase convention is left to the caller (usually phi = 2π (t-t0)/P).
   */
  phase?: number;
};

/**
 * Numerically stable "wrap to [-π, π]" for phase differences.
 */
function wrapPi(x: number): number {
  if (!Number.isFinite(x)) return 0;
  // Using atan2 for stable wrap
  return Math.atan2(Math.sin(x), Math.cos(x));
}

/**
 * Henyey–Greenstein phase function p(θ), normalized over 4π:
 * p(θ) = (1/(4π)) * (1 - g^2) / (1 + g^2 - 2g cosθ)^(3/2)
 *
 * Returns a value in 1/sr (steradian^-1) in the formal definition;
 * here it is used as a dimensionless shape factor and later normalized/clamped.
 */
function henyeyGreensteinPhase(g: number, cosTheta: number): number {
  // Clamp to avoid singularity when g->1 and cosTheta->1.
  const gg = clamp(g, -0.999, 0.999);
  const mu = clamp(cosTheta, -1, 1);
  const denom = 1 + gg * gg - 2 * gg * mu;
  // denom > 0 for |g|<1; keep floor for numerical safety.
  const d = Math.max(1e-12, denom);
  const p = (1 / (4 * Math.PI)) * ((1 - gg * gg) / Math.pow(d, 1.5));
  return Number.isFinite(p) ? p : 0;
}

/**
 * Approximate scattering angle for "forward scattering around transit".
 *
 * Minimal geometry used here:
 * - Incoming direction (star -> particle): along rBody (from star to particle).
 * - Outgoing direction (particle -> observer): approximately along observerDir (star -> observer),
 *   because observer is at infinity so particle->observer direction ~ star->observer direction.
 *
 * Scattering angle θ is the angle between incoming and outgoing directions.
 * - Forward scattering corresponds to θ ≈ 0 (cosθ ≈ 1).
 */
function approximateCosScatteringAngle(rBody: Vec3, observerDirUnit: Vec3): number {
  if (!vIsFinite(rBody)) return 0;

  // Normalize rBody; if it is zero vector, return orthogonal (cos=0) to avoid blowups.
  let rHat: Vec3;
  try {
    rHat = vNormalizeOrThrow(rBody, 1e-15, "rBody must be non-zero for scattering angle.");
  } catch {
    // Fail-open: zero-length rBody cannot define a scattering angle; return cos=0 (orthogonal, no scattering).
    return 0;
  }

  // Incoming: along rHat (star -> particle).
  // Outgoing: along observerDirUnit (star -> observer).
  const cosTheta = vDot(rHat, observerDirUnit);
  return clamp(cosTheta, -1, 1);
}

/**
 * Additive forward-scattering flux (stellar units).
 *
 * Intended usage in sim.ts:
 * F_total = (baseline + variability) * F_transit + (phaseCurve + forwardScattering)
 */
export function computeForwardScatteringFlux(params: ForwardScatteringFluxParams): number {
  const model = params.model;
  if (!model?.enabled) return 0;

  const amp = isFiniteNumber(model.amp) ? model.amp : 0;
  if (!(amp > 0)) return 0;

  const clampNonNeg = model.clampNonNegative !== false;
  const gateBehind = model.gateWhenBehindStar !== false;

  // Normalize observer dir; if invalid, no scattering contribution.
  let obsHat: Vec3;
  try {
    obsHat = vNormalizeOrThrow(params.observerDir, 1e-15, "observerDir must be non-zero.");
  } catch {
    // Fail-open: degenerate observer direction; return zero scattering contribution.
    return 0;
  }

  // Optional gate for when body is behind the star (secondary eclipse region).
  // Convention (see dayNightVisibility.ts): observerDir points star -> observer,
  // rBody points star -> body. When the body is between star and observer (transit
  // geometry), both vectors point in roughly the same direction, so vDot > 0.
  // Therefore vDot(rBody, observerDir) > 0 correctly means "body in front of the
  // star from the observer's perspective" — exactly when forward scattering is
  // physically expected. The rear hemisphere (vDot <= 0) is gated off.
  if (gateBehind) {
    const front = vDot(params.rBody, obsHat) > 0;
    if (!front) return 0;
  }

  const kind = model.kind ?? "hg-angle";
  // Width controls:
  const sigma = isFiniteNumber(model.sigmaPhase) ? model.sigmaPhase : 0.15; // rad, broad default
  const sigmaClamped = clamp(sigma, 1e-6, Math.PI);

  let f: number;
  if (kind === "gaussian-time") {
    // Purely phenomenological: two-sided brightening peak around a "transit-like" phase center.
    // Using a wrapped phase difference so it is periodic.
    const phase = isFiniteNumber(params.phase) ? params.phase : 0;
    const offset = isFiniteNumber(model.phaseOffset) ? model.phaseOffset : 0;
    const dphi = wrapPi(phase - offset);

    // Gaussian in phase:
    // shape = exp(-(dphi^2)/(2 sigma^2))
    const shape = Math.exp(-(dphi * dphi) / (2 * sigmaClamped * sigmaClamped));
    f = amp * shape;
  } else {
    // HG-based angle model.
    // Compute approximate scattering angle theta; forward scattering => cosθ ~ 1.
    const cosTheta0 = approximateCosScatteringAngle(params.rBody, obsHat);

    // Optional phase offset: interpret as a tiny angular "misalignment" proxy by reducing cosθ
    // when offset != 0. This is an intentional toy model simplification — applying the offset
    // via acos/cos round-trip can produce physically meaningless scattering angles (e.g.,
    // values outside the valid geometric range), but the effect is acceptable for interactive
    // visualization purposes.  For physically rigorous models, use proper orbital geometry.
    const offset = isFiniteNumber(model.phaseOffset) ? model.phaseOffset : 0;
    const cosTheta = Math.cos(Math.acos(cosTheta0) + offset);

    const g = isFiniteNumber(model.g) ? model.g : 0.8;
    const rawPhaseVal = henyeyGreensteinPhase(g, cosTheta);

    // To normalize nicely so amp has intuitive meaning "peak height":
    // Divide by the peak value (at cosTheta=1) so max shape factor is 1.0.
    const peakPhaseVal = henyeyGreensteinPhase(g, 1.0);
    const shape = peakPhaseVal > 0 ? rawPhaseVal / peakPhaseVal : rawPhaseVal > 0 ? 1 : 0;
    f = amp * shape;
  }

  if (clampNonNeg) f = Math.max(0, f);
  return isFiniteNumber(f) ? f : 0;
}
