/**
 * Owns diagnostics support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
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

  // Match the Plummer-softened force law used by the integrator. This remains
  // a Newtonian diagnostic; the optional 1PN acceleration is not represented
  // by this scalar energy.
  const potential = computePotentialEnergy(arrays, cfg.softening);
  if (potential === null) return null;

  return finalizeDiagnostics(motion, potential);
}
