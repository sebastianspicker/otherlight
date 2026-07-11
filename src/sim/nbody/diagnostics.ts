import {
  bodyArraysHaveMatchingLengths,
  computeMotionSums,
  computePotentialEnergy,
  finalizeDiagnostics,
} from "./diagnosticsEnergy";
import { buildBodyArrays } from "./integrator";
import type { NBodyConservationDiagnostics, NBodyState, ResolvedNBodyConfig } from "./types";

export function computeConservationDiagnostics(
  state: NBodyState,
  cfg: ResolvedNBodyConfig,
): NBodyConservationDiagnostics | null {
  const arrays = buildBodyArrays(state, cfg);
  if (!bodyArraysHaveMatchingLengths(arrays)) return null;

  const motion = computeMotionSums(arrays);
  if (!motion) return null;

  const potential = computePotentialEnergy(arrays);
  if (potential === null) return null;

  return finalizeDiagnostics(motion, potential);
}
