/** Models additive forward-scattering brightening near transit. */

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
import { resolveForwardScatteringContext, passesForwardScatteringGate } from "./forwardScatteringContext";
import {
  finalizeForwardScatteringFlux,
  gaussianTimeForwardScatteringFlux,
  hgAngleForwardScatteringFlux,
} from "./forwardScatteringModels";

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
 * Additive forward-scattering flux (stellar units).
 *
 * Intended usage in sim.ts:
 * F_total = (baseline + variability) * F_transit + (phaseCurve + forwardScattering)
 */
export function computeForwardScatteringFlux(params: ForwardScatteringFluxParams): number {
  const context = resolveForwardScatteringContext(params);
  if (!context) return 0;
  if (!passesForwardScatteringGate(params, context)) return 0;
  const flux =
    context.kind === "gaussian-time"
      ? gaussianTimeForwardScatteringFlux(params, context)
      : hgAngleForwardScatteringFlux(params, context);
  return finalizeForwardScatteringFlux(flux, context.clampNonNegative);
}
