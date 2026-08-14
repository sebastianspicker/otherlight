/** Aggregates non-occultation flux contributions into the normalized observation. */
import type { SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import type { BodyKinematics } from "./kinematics";
import { createAdditiveFluxContext } from "./additiveFluxContext";
import { applyBodyOccultationTerms, computeMutualVisibleFractions } from "./additiveFluxOccultation";
import { applyRtEmissionTerms, computePhaseFluxTerms } from "./additiveFluxPhase";
import {
  computeForwardScatteringTerm,
  computeRefractionTerm,
  computeRingScatteringTerm,
  computeStellarVariabilityTerm,
  finalizeAdditiveFluxComponents,
} from "./additiveFluxEffects";

export type { AdditiveFluxComponents } from "./additiveFluxTypes";
import type { AdditiveFluxComponents } from "./additiveFluxTypes";

export function computeAdditiveFluxComponents(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): AdditiveFluxComponents {
  const context = createAdditiveFluxContext(params, t, observerDir, kin);
  const emittedFlux = applyRtEmissionTerms(context, computePhaseFluxTerms(context));
  const visibleFractions = computeMutualVisibleFractions(context, emittedFlux);
  const occultedFlux = applyBodyOccultationTerms(context, emittedFlux);

  return finalizeAdditiveFluxComponents({
    ...occultedFlux,
    fluxStellarVarOnly: computeStellarVariabilityTerm(context),
    fluxForwardScatteringOnly: computeForwardScatteringTerm(context),
    fluxRingScatteringOnly: computeRingScatteringTerm(context),
    fluxRefractionOnly: computeRefractionTerm(context),
    ...visibleFractions,
  });
}
