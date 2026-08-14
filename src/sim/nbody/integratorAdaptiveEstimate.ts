/** Calculates the full-step versus two-half-step adaptive Verlet estimate. */
import { integrateStepWithConfig, maxPositionDifference } from "./integratorVerlet";
import type { NBodyState, ResolvedNBodyConfig } from "./types";

export type AdaptiveEstimate = {
  state: NBodyState;
  err: number;
};

export function estimateAdaptiveVerletStep(
  state: NBodyState,
  dtTry: number,
  cfg: ResolvedNBodyConfig,
): AdaptiveEstimate {
  const full = integrateStepWithConfig({ state, dt: dtTry, cfg });
  const half1 = integrateStepWithConfig({ state, dt: 0.5 * dtTry, cfg });
  const half2 = integrateStepWithConfig({ state: half1, dt: 0.5 * dtTry, cfg });
  half2.minimumEncounterDistance = minimumFiniteDistance(
    full.minimumEncounterDistance,
    half2.minimumEncounterDistance,
  );
  return { state: half2, err: maxPositionDifference(full, half2) };
}

export function minimumFiniteDistance(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  const values = [left, right].filter((value): value is number => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : undefined;
}
