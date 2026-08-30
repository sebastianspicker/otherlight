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

import { resolveForwardScatteringContext, passesForwardScatteringGate } from "./forwardScatteringContext";
import {
  finalizeForwardScatteringFlux,
  gaussianTimeForwardScatteringFlux,
  hgAngleForwardScatteringFlux,
} from "./forwardScatteringModels";

import type { ForwardScatteringFluxParams } from "./forwardScatteringTypes";
export type { ForwardScatteringFluxParams, ForwardScatteringModel } from "./forwardScatteringTypes";

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
