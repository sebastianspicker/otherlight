/** Validates active V4 authoring dynamics that are independent of unavailable solvers. */
import type { BrowserScenarioDraft, SystemDynamicsParams } from "../../model/types";

type TimekeepingParams = NonNullable<BrowserScenarioDraft["observer"]>["timekeeping"];

function assertFidelityProfile(dynamics: SystemDynamicsParams | undefined): void {
  const profile = dynamics?.fidelityProfile;
  if (
    profile !== undefined &&
    profile !== "interactive" &&
    profile !== "accurate" &&
    profile !== "reference"
  ) {
    throw new Error("dynamics.fidelityProfile must be interactive|accurate|reference if provided.");
  }
}

function assertTimekeeping(timekeeping: TimekeepingParams): void {
  if (!timekeeping?.enabled) return;
  for (const field of ["barycentricOffsetSec", "periodicErrorAmpSec", "phaseSec"] as const) {
    if (timekeeping[field] !== undefined && !Number.isFinite(timekeeping[field])) {
      throw new Error(`observer.timekeeping.${field} must be finite if provided.`);
    }
  }
  if (
    timekeeping.periodSec !== undefined &&
    (!Number.isFinite(timekeeping.periodSec) || timekeeping.periodSec <= 0)
  ) {
    throw new Error("observer.timekeeping.periodSec must be finite and > 0 if provided.");
  }
}

export function assertDynamicsInputs(params: BrowserScenarioDraft): void {
  assertFidelityProfile(params.dynamics);
  assertTimekeeping(params.observer?.timekeeping);
}
