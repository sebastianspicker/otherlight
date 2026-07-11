import type { LimbDarkeningLaw, PassbandId } from "../core/types";
import { lawForBandKey, normalizeBandpassId } from "./limbDarkeningLookupCommon";

export function findNormalizedBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw>,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  const norm = normalizeBandpassId(bandpass);
  const matchingKey = norm ? Object.keys(bands).find((key) => normalizeBandpassId(key) === norm) : undefined;
  return matchingKey ? lawForBandKey(bands, matchingKey) : undefined;
}
