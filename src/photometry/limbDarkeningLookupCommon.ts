/**
 * Owns limb Darkening Lookup Common support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { LimbDarkeningLaw, PassbandId } from "../core/types";

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

export function lawForBandKey(
  bands: Record<PassbandId, LimbDarkeningLaw>,
  key: string,
): LimbDarkeningLaw | undefined {
  if (!Object.prototype.hasOwnProperty.call(bands, key)) return undefined;
  const candidate = bands[key as PassbandId];
  return isLawObject(candidate) ? candidate : undefined;
}
