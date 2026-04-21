import type { SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { vIsFinite, vNormalizeOrThrow } from "../physics/vec3";

export function getObserverDir(params: SystemParams): Vec3 {
  const d = params.observer?.dir ?? { x: 0, y: 0, z: 1 };
  return vNormalizeOrThrow(d, 1e-15, "observer.dir must be non-zero.");
}

/**
 * Canonical runtime contract for all timing/observer dependent computations.
 * This is intentionally strict to keep diagnostics/observables/flux paths aligned.
 */
export function assertTimeObserverContract(params: {
  system: SystemParams;
  tObs: number;
  observerDir: Vec3;
}): void {
  if (!Number.isFinite(params.tObs)) {
    throw new Error("time-observer contract: tObs must be finite.");
  }
  if (!vIsFinite(params.observerDir)) {
    throw new Error("time-observer contract: observerDir must be finite.");
  }
  const n = Math.hypot(params.observerDir.x, params.observerDir.y, params.observerDir.z);
  if (!(n > 0)) {
    throw new Error("time-observer contract: observerDir must be non-zero.");
  }
  if (!params.system?.star || !params.system?.planet) {
    throw new Error("time-observer contract: system must define star and planet.");
  }
}
