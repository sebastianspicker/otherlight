/**
 * Owns limb Darkening Lookup support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { LimbDarkeningLaw, PassbandId } from "../model/types";
import { findDirectBandLaw } from "./limbDarkeningLookupDirect";
import { findNormalizedBandLaw } from "./limbDarkeningLookupNormalized";

export { isLawObject, lawForBandKey, normalizeBandpassId } from "./limbDarkeningLookupCommon";

export function findBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw> | undefined,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  if (!bands) return undefined;
  return findDirectBandLaw(bands, bandpass) ?? findNormalizedBandLaw(bands, bandpass);
}
