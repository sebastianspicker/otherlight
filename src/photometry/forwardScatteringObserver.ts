import type { Vec3 } from "../physics/vec3";
import { vNormalizeOrThrow } from "../physics/vec3";

export function normalizedObserverDirection(observerDir: Vec3): Vec3 | undefined {
  try {
    return vNormalizeOrThrow(observerDir, 1e-15, "observerDir must be non-zero.");
  } catch {
    return undefined;
  }
}
