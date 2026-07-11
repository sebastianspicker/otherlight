import type { LimbDarkeningLaw, PassbandId } from "../core/types";
import { lawForBandKey, normalizeBandpassId } from "./limbDarkeningLookupCommon";

export function findDirectBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw>,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  for (const key of directBandKeys(bandpass)) {
    const law = lawForBandKey(bands, key);
    if (law) return law;
  }
  return undefined;
}

function directBandKeys(bandpass: unknown): string[] {
  const raw = bandpass === undefined || bandpass === null ? "" : String(bandpass);
  const norm = normalizeBandpassId(raw);
  if (!raw) return norm ? [norm] : [];
  if (!norm || norm === raw) return [raw];
  return [raw, norm];
}
