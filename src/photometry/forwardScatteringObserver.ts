/**
 * Owns forward Scattering Observer support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { Vec3 } from "../physics/vec3";
import { vNormalizeOrThrow } from "../physics/vec3";

export function normalizedObserverDirection(observerDir: Vec3): Vec3 | undefined {
  try {
    return vNormalizeOrThrow(observerDir, 1e-15, "observerDir must be non-zero.");
  } catch {
    return undefined;
  }
}
