import type { LimbDarkeningLaw, PassbandId } from "../core/types";
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
