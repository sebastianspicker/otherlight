/** Models phenomenological stellar variability terms in normalized flux units. */
//
// Small out-of-transit stellar/system photometry terms (phenomenological):
// - Doppler beaming (a.k.a. Doppler boosting) ~ sin(phi)
// - Ellipsoidal variation ~ cos(2*phi)
// - Optional constant offset
//
// Scientific intent / scope:
// - Implements observer-space light-curve harmonics (not a physical RV + stellar-shape forward model).
// - Amplitudes are provided directly in "stellar flux units" relative to a normalized baseline ~1.0.
// - Phase can be derived in two ways:
//   (A) "linear-period" (default): linear phase from (t - t0) / period (mean-anomaly-like).
//   (B) "true-anomaly": solves Kepler’s equation to derive true anomaly for eccentric orbits (still a toy mapping).
//
// Stability / clamping policy:
// - Returns a small additive term, usually |f| << 1.
// - Applies a configurable stability clamp (default ±1e3) purely as a safety guard.

import type { OrbitElements, StellarVariabilityParams, StellarVariabilityPhaseModel } from "../model/types";
import { clamp, isFiniteNumber, wrapTo2Pi } from "../model/units";
import { solveKeplerE, trueAnomalyFromE } from "../orbits/kepler";
import {
  finiteOrZero,
  hasNoVariability,
  normalizeClampBounds,
  variabilityComponents,
  type StellarVariabilityComponents,
} from "./stellarVariabilityComponents";

export type { StellarVariabilityParams, StellarVariabilityPhaseModel } from "../model/types";

/**
 * Compute an orbital phase angle phi(t) in [0, 2π) from (period, t0).
 *
 * Convention:
 *   phi = wrapTo2Pi( 2π * (t - t0) / period )
 */
export function orbitalPhaseFromPeriod(params: { t: number; period: number; t0: number }): number {
  const { t, period, t0 } = params;

  if (!Number.isFinite(t) || !Number.isFinite(period) || !Number.isFinite(t0)) return NaN;
  if (period <= 0) return NaN;

  const phi = (2 * Math.PI * (t - t0)) / period;
  return wrapTo2Pi(phi);
}

/**
 * Smooth periodic lifecycle weight in [0,1] for spot evolution.
 * If lifetimeSec <= 0 or invalid, returns 1 (no fading).
 */
export function spotLifecycleWeight(params: {
  t: number;
  lifetimeSec: number;
  t0?: number;
  phaseOffset?: number;
}): number {
  const inputs = resolveSpotLifecycleInputs(params);
  if (!inputs) return 1;

  const phi = wrapTo2Pi((2 * Math.PI * (inputs.t - inputs.t0)) / inputs.lifetimeSec + inputs.phaseOffset);
  const w = 0.5 - 0.5 * Math.cos(phi);
  return Number.isFinite(w) ? clamp(w, 0, 1) : 1;
}

function resolveSpotLifecycleInputs(params: {
  t: number;
  lifetimeSec: number;
  t0?: number;
  phaseOffset?: number;
}): { t: number; lifetimeSec: number; t0: number; phaseOffset: number } | undefined {
  if (!Number.isFinite(params.t) || !Number.isFinite(params.lifetimeSec) || params.lifetimeSec <= 0) {
    return undefined;
  }
  return {
    t: params.t,
    lifetimeSec: params.lifetimeSec,
    t0: isFiniteNumber(params.t0) ? (params.t0 as number) : 0,
    phaseOffset: isFiniteNumber(params.phaseOffset) ? (params.phaseOffset as number) : 0,
  };
}

/**
 * Compute a "true-anomaly phase" phi(t) in [0, 2π) by solving Kepler’s equation.
 *
 * Implementation:
 * - Mean anomaly: M = 2π * (t - t0) / period
 * - Eccentric anomaly: E = solveKeplerE(M, e)
 * - True anomaly: nu = trueAnomalyFromE(E, e)
 * - Return wrapTo2Pi(nu)
 */
function orbitalPhaseFromTrueAnomaly(params: { t: number; period: number; t0: number; e: number }): number {
  const { t, period, t0, e } = params;

  if (!Number.isFinite(t) || !Number.isFinite(period) || !Number.isFinite(t0) || !Number.isFinite(e))
    return NaN;
  if (period <= 0) return NaN;
  if (e < 0 || e >= 1) return NaN;

  const M = (2 * Math.PI * (t - t0)) / period;
  const E = solveKeplerE(M, e);
  const nu = trueAnomalyFromE(E, e);

  return wrapTo2Pi(nu);
}

type StellarVariabilityContext = {
  t: number;
  orbit: OrbitElements;
  model: StellarVariabilityParams;
  period: number;
  t0: number;
};

function resolveStellarVariabilityContext(params: {
  t: number;
  orbit: OrbitElements;
  model?: StellarVariabilityParams;
}): StellarVariabilityContext | undefined {
  const model = params.model;
  if (!model?.enabled) return undefined;
  const period = params.orbit?.period;
  const t0 = params.orbit?.t0;
  if (!hasValidOrbitalClock(params.t, period, t0)) return undefined;
  return { t: params.t, orbit: params.orbit, model, period, t0 };
}

function hasValidOrbitalClock(t: number, period: number, t0: number): boolean {
  return Number.isFinite(t) && Number.isFinite(period) && period > 0 && Number.isFinite(t0);
}

function variabilityPhase(context: StellarVariabilityContext): number {
  const phaseModel: StellarVariabilityPhaseModel = context.model.phaseModel ?? "linear-period";
  if (phaseModel === "true-anomaly") {
    return orbitalPhaseFromTrueAnomaly({
      t: context.t,
      period: context.period,
      t0: context.t0,
      e: context.orbit.e,
    });
  }
  return orbitalPhaseFromPeriod({ t: context.t, period: context.period, t0: context.t0 });
}

function harmonicVariabilityTerms(
  phi: number,
  model: StellarVariabilityParams,
  components: StellarVariabilityComponents,
): number {
  const beamingOffset = finiteOrZero(model.beamingOffset);
  const ellipOffset = finiteOrZero(model.ellipsoidalOffset);
  return (
    components.beamingAmp * Math.sin(phi + beamingOffset) -
    components.ellipAmp * Math.cos(2 * (phi + ellipOffset))
  );
}

function combineVariabilityTerms(
  phi: number,
  model: StellarVariabilityParams,
  components: StellarVariabilityComponents,
): number {
  return (
    components.constant +
    harmonicVariabilityTerms(phi, model, components) +
    components.flare +
    components.pulsations
  );
}

/**
 * Phenomenological stellar variability flux term (additive, in stellar units).
 *
 * Returns:
 * - Small additive value f_var(t), typically near 0.
 * - If model is disabled or invalid, returns 0.
 *
 * Robustness:
 * - Non-finite or nonsensical inputs produce 0 (safe no-op).
 * - A stability clamp is applied at the end (configurable).
 */
export function stellarVariabilityFlux(params: {
  t: number;
  orbit: OrbitElements;
  model?: StellarVariabilityParams;
}): number {
  const context = resolveStellarVariabilityContext(params);
  if (!context) return 0;

  const components = variabilityComponents(context.t, context.model);
  if (hasNoVariability(components)) return 0;

  const phi = variabilityPhase(context);
  if (!Number.isFinite(phi)) return 0;

  const out = combineVariabilityTerms(phi, context.model, components);
  if (!Number.isFinite(out)) return 0;

  const { min, max } = normalizeClampBounds(context.model);
  return clamp(out, min, max);
}
