/**
 * Looks up the limb-darkening law for a band.
 */
import type { LimbDarkeningLaw, PassbandId } from "../model/types";

export function normalizeBandpassId(id: unknown): PassbandId | undefined {
  if (id === undefined || id === null) return undefined;
  const s = String(id).trim();
  if (!s) return undefined;
  return s.toLowerCase();
}

export function isLawObject(candidate: unknown): candidate is LimbDarkeningLaw {
  return Boolean(
    candidate && typeof candidate === "object" && "kind" in candidate && typeof candidate.kind === "string",
  );
}

function lawForBandKey(
  bands: Record<PassbandId, LimbDarkeningLaw>,
  key: string,
): LimbDarkeningLaw | undefined {
  if (!Object.prototype.hasOwnProperty.call(bands, key)) return undefined;
  const candidate = bands[key as PassbandId];
  return isLawObject(candidate) ? candidate : undefined;
}

function directBandKeys(bandpass: unknown): string[] {
  const raw = bandpass === undefined || bandpass === null ? "" : String(bandpass);
  const norm = normalizeBandpassId(raw);
  if (!raw) return norm ? [norm] : [];
  if (!norm || norm === raw) return [raw];
  return [raw, norm];
}

function findDirectBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw>,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  for (const key of directBandKeys(bandpass)) {
    const law = lawForBandKey(bands, key);
    if (law) return law;
  }
  return undefined;
}

function findNormalizedBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw>,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  const norm = normalizeBandpassId(bandpass);
  const matchingKey = norm ? Object.keys(bands).find((key) => normalizeBandpassId(key) === norm) : undefined;
  return matchingKey ? lawForBandKey(bands, matchingKey) : undefined;
}

export function findBandLaw(
  bands: Record<PassbandId, LimbDarkeningLaw> | undefined,
  bandpass: unknown,
): LimbDarkeningLaw | undefined {
  if (!bands) return undefined;
  return findDirectBandLaw(bands, bandpass) ?? findNormalizedBandLaw(bands, bandpass);
}
