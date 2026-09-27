/**
 * Normalizes the observer direction for forward scattering.
 */
import type { Vec3 } from "../orbits/vec3";
import { vNormalizeOrThrow } from "../orbits/vec3";

export function normalizedObserverDirection(observerDir: Vec3): Vec3 | undefined {
  try {
    return vNormalizeOrThrow(observerDir, 1e-15, "observerDir must be non-zero.");
  } catch {
    return undefined;
  }
}
