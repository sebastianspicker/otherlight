// src/sim/observer.ts

import type { SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { vIsFinite, vNormalizeOrThrow } from "../physics/vec3";

/**
 * Returns the observer line-of-sight direction in inertial coordinates.
 *
 * Convention (see core/types.ts):
 * - observer.dir points from the star (origin) toward the observer.
 */
export function getObserverDir(params: SystemParams): Vec3 {
  const dirRaw: Vec3 = params.observer?.dir ?? { x: 0, y: 0, z: 1 };

  if (!vIsFinite(dirRaw)) throw new Error("observer.dir must be finite.");

  // Enforce non-zero direction to prevent undefined sky-plane basis.
  return vNormalizeOrThrow(dirRaw, 1e-15, "observer.dir must be non-zero.");
}
