/** Combines stellar occultation and photometric terms into normalized transit flux. */
import type { BrightnessPatch, SystemParams } from "../core/types";
import type { OcculterShape } from "../photometry/occulterEllipse";
import type { BodyKinematics } from "./kinematics";
import { computeCircleFlux, computeMixedShapeFlux, createTransitFluxInputs } from "./transitFluxOccultation";
import { computeTransmissionFlux, warnUnsupportedTransmission } from "./transitFluxTransmission";

export { MAX_SPECTRAL_SAMPLES } from "../core/transitComputeBudget";

/**
 * Compute the multiplicative stellar transit attenuation factor F_transit in [0, 1].
 *
 * Policy chain (first match wins):
 * 1. Atmosphere transmission enabled -> transmissive grid integrator
 * 2. Limb-darkening model + optional LD integrators -> LD disk integrator
 * 3. Brightness patches -> patched uniform-disk integrator
 * 4. Default -> uniform-disk integrator
 *
 * Always clamps output to [0, 1] and fails open to 1.0 on non-finite results.
 */
export function computeTransitFlux(
  params: SystemParams,
  occulters: OcculterShape[],
  kin: BodyKinematics,
  opts?: { brightnessPatchesOverride?: BrightnessPatch[] },
): number {
  const inputs = createTransitFluxInputs(params, occulters, kin, opts);
  const transmissionFlux = computeTransmissionFlux(params, kin, inputs);
  if (transmissionFlux !== undefined) return transmissionFlux;

  warnUnsupportedTransmission(params, inputs);
  return inputs.allCircles ? computeCircleFlux(inputs) : computeMixedShapeFlux(inputs);
}
