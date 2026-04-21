// src/photometry/stellarVariability.ts
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

import type { OrbitElements, StellarVariabilityParams, StellarVariabilityPhaseModel } from "../core/types";
import { clamp, isFiniteNumber, wrapTo2Pi } from "../core/units";
import { solveKeplerE, trueAnomalyFromE } from "../physics/kepler";

export type { StellarVariabilityParams, StellarVariabilityPhaseModel } from "../core/types";

function finiteOrZero(x: unknown): number {
  return isFiniteNumber(x) ? x : 0;
}

function finiteOrDefault(x: unknown, def: number): number {
  return isFiniteNumber(x) ? x : def;
}

function flareContribution(t: number, model?: StellarVariabilityParams["flare"]): number {
  if (!model?.enabled || !Number.isFinite(t)) return 0;
  const amp = Math.max(0, finiteOrZero(model.amp));
  const tPeak = finiteOrDefault(model.tPeakSec, 0);
  const riseSec = Math.max(1e-6, finiteOrDefault(model.riseSec, 300));
  const decaySec = Math.max(1e-6, finiteOrDefault(model.decaySec, 1200));
  if (amp <= 0) return 0;

  const dt = t - tPeak;
  if (dt <= 0) {
    return amp * Math.exp(-0.5 * (dt / riseSec) ** 2);
  }
  return amp * Math.exp(-dt / decaySec);
}

function pulsationContribution(t: number, model?: StellarVariabilityParams["pulsations"]): number {
  if (!model?.enabled || !Number.isFinite(t) || !Array.isArray(model.modes)) return 0;
  let acc = 0;
  for (const mode of model.modes) {
    const amp = finiteOrZero(mode.amp);
    const periodSec = finiteOrDefault(mode.periodSec, NaN);
    const phaseRad = finiteOrZero(mode.phaseRad);
    if (!(Number.isFinite(amp) && amp !== 0 && Number.isFinite(periodSec) && periodSec > 0)) continue;
    acc += amp * Math.sin((2 * Math.PI * t) / periodSec + phaseRad);
  }
  return Number.isFinite(acc) ? acc : 0;
}

function normalizeClampBounds(model?: StellarVariabilityParams): {
  min: number;
  max: number;
} {
  const min0 = finiteOrDefault(model?.clampMin, -1e3);
  const max0 = finiteOrDefault(model?.clampMax, 1e3);

  // If user swaps them or provides nonsense, fall back to defaults.
  if (!Number.isFinite(min0) || !Number.isFinite(max0)) return { min: -1e3, max: 1e3 };
  if (min0 === max0) return { min: -1e3, max: 1e3 };

  const min = Math.min(min0, max0);
  const max = Math.max(min0, max0);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1e3, max: 1e3 };
  return { min, max };
}

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
  const t = params.t;
  const lifetime = params.lifetimeSec;
  if (!Number.isFinite(t) || !Number.isFinite(lifetime) || lifetime <= 0) return 1;

  const t0 = isFiniteNumber(params.t0) ? (params.t0 as number) : 0;
  const phaseOffset = isFiniteNumber(params.phaseOffset) ? (params.phaseOffset as number) : 0;

  const phi = wrapTo2Pi((2 * Math.PI * (t - t0)) / lifetime + phaseOffset);
  const w = 0.5 - 0.5 * Math.cos(phi);
  return Number.isFinite(w) ? clamp(w, 0, 1) : 1;
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
  const model = params.model;
  if (!model?.enabled) return 0;

  const orbit = params.orbit;
  const t = params.t;

  const P = orbit?.period;
  const t0 = orbit?.t0;

  if (!Number.isFinite(t) || !Number.isFinite(P) || P <= 0 || !Number.isFinite(t0)) return 0;

  const beamingAmp = finiteOrZero(model.beamingAmp);
  const ellipAmp = finiteOrZero(model.ellipsoidalAmp);
  const constant = finiteOrDefault(model.constant, 0);
  const flare = flareContribution(t, model.flare);
  const pulsations = pulsationContribution(t, model.pulsations);

  // Fast no-op.
  if (beamingAmp === 0 && ellipAmp === 0 && constant === 0 && flare === 0 && pulsations === 0) return 0;

  const phaseModel: StellarVariabilityPhaseModel = model.phaseModel ?? "linear-period";

  const phi =
    phaseModel === "true-anomaly"
      ? orbitalPhaseFromTrueAnomaly({ t, period: P, t0, e: orbit.e })
      : orbitalPhaseFromPeriod({ t, period: P, t0 });

  if (!Number.isFinite(phi)) return 0;

  const beamingOffset = finiteOrZero(model.beamingOffset);
  const ellipOffset = finiteOrZero(model.ellipsoidalOffset);

  // Compute harmonics:
  // Beaming: ~ sin(phi)
  // Ellipsoidal: ~ -cos(2*phi) (negative sign: flux is maximized at quadrature phases,
  // where the tidal bulge presents maximum cross-section to the observer).
  const termBeaming = beamingAmp * Math.sin(phi + beamingOffset);
  const termEllip = -ellipAmp * Math.cos(2 * (phi + ellipOffset));

  const out = constant + termBeaming + termEllip + flare + pulsations;
  if (!Number.isFinite(out)) return 0;

  const { min, max } = normalizeClampBounds(model);
  return clamp(out, min, max);
}

// ---------------------------
// Minimal built-in tests
// ---------------------------

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`stellarVariability self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-12): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Self-tests:
 * - For e=0, "true-anomaly" and "linear-period" should match (nu == M modulo 2π).
 * - The function should be stable and finite for typical values.
 */
export function runStellarVariabilitySelfTests(): void {
  const orbitCirc: OrbitElements = {
    a: 1,
    e: 0,
    inc: 0,
    Omega: 0,
    omega: 0,
    period: 10,
    t0: 0,
  };

  for (const t of [0, 1, 2.5, 7.7, 10.0, 123.4]) {
    const phiLin = orbitalPhaseFromPeriod({
      t,
      period: orbitCirc.period,
      t0: orbitCirc.t0,
    });
    const phiTA = orbitalPhaseFromTrueAnomaly({
      t,
      period: orbitCirc.period,
      t0: orbitCirc.t0,
      e: orbitCirc.e,
    });

    assert(Number.isFinite(phiLin) && Number.isFinite(phiTA), "Phases must be finite for e=0.");

    // Compare wrapped difference.
    const d = wrapTo2Pi(phiLin - phiTA);
    assert(approxEq(d, 0, 1e-10) || approxEq(d, 2 * Math.PI, 1e-10), "e=0 phases should match.");
  }

  const f = stellarVariabilityFlux({
    t: 3,
    orbit: orbitCirc,
    model: {
      enabled: true,
      beamingAmp: 1e-4,
      ellipsoidalAmp: 2e-4,
      constant: 0,
      phaseModel: "linear-period",
    },
  });
  assert(Number.isFinite(f), "Flux must be finite for typical settings.");
}
