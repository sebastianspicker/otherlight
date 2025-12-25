// src/photometry/stellarVariability.ts
//
// Small out-of-transit stellar/system photometry terms (phenomenological):
// - Doppler beaming (a.k.a. Doppler boosting) ~ sin(phi)
// - Ellipsoidal variation ~ cos(2*phi)
// - Optional constant offset
//
// Scientific intent / scope:
// - Implements *observer-space* light-curve harmonics, not a physical RV + stellar-shape forward model.
// - Amplitudes are provided directly in "stellar flux units" relative to a normalized baseline ~1.0. 
// - Phase can be derived in two ways:
//   (A) "linear-period" (default): uses a linear phase from (t - t0) / period.
//       This is essentially mean-anomaly-like and is most appropriate for near-circular orbits. 
//   (B) "true-anomaly": optional; uses the orbit eccentricity and solves Kepler’s equation to derive true anomaly.
//       This better tracks orbital speed changes for e != 0, but it is still a *toy* mapping for photometric
//       beaming/ellipsoidal signals because those depend on RV projection, argument of periapsis, inclination,
//       and stellar response details not modeled here. 
//
// Recommended combination convention (implemented in sim.ts, not here):
//   F_total(t) = (baselineFlux + phaseCurveTerms + stellarVariabilityTerms) * F_transitMultiplicative(t) 
//
// Stability / clamping policy:
// - This module returns a small additive term, usually |f| << 1.
// - To avoid destabilizing UIs/renderers when users enter absurd amplitudes, a stability clamp is applied.
// - The clamp bounds are configurable (default ±1e3) and intended purely as a safety guard (not physical realism). 

import type { OrbitElements } from "../core/types";
import { clamp, wrapTo2Pi } from "../core/units";
import { solveKeplerE, trueAnomalyFromE } from "../physics/kepler";

export type StellarVariabilityPhaseModel = "linear-period" | "true-anomaly";

export type StellarVariabilityParams = {
  enabled?: boolean;

  /**
   * Doppler beaming amplitude in stellar units.
   * Typical order-of-magnitude for hot Jupiters is ~1e-6..1e-4, but this simulator treats it as a knob. 
   *
   * Model: +beamingAmp * sin(phi + beamingOffset)
   *
   * Sign convention:
   * - Positive beamingAmp makes flux larger near phi ≈ +π/2 (under the default phase definition).
   * - This is a phenomenological convention; users can flip sign or adjust offsets as desired.
   */
  beamingAmp?: number;

  /**
   * Ellipsoidal variation amplitude in stellar units.
   * Typical order-of-magnitude is similar to or somewhat larger than beaming for massive close-in planets,
   * but is again treated as a free parameter here. 
   *
   * Model: +ellipsoidalAmp * cos(2*(phi + ellipsoidalOffset))
   */
  ellipsoidalAmp?: number;

  /** Optional phase offset for beaming term [rad]. */
  beamingOffset?: number;

  /** Optional phase offset for ellipsoidal term [rad]. */
  ellipsoidalOffset?: number;

  /**
   * Optional constant additive component in stellar units.
   * Useful as a "floor" if desired; recommended domain: constant >= 0. 
   */
  constant?: number;

  /**
   * Phase model selection.
   * - "linear-period" (default): phi(t) from period, t0 (toy-correct for e != 0). 
   * - "true-anomaly": derives nu(t) by solving Kepler's equation using orbit.e (still a toy mapping). 
   */
  phaseModel?: StellarVariabilityPhaseModel;

  /**
   * Stability clamp bounds for the returned additive term (NOT physical realism).
   * If omitted, defaults to [-1e3, +1e3]. 
   */
  clampMin?: number;
  clampMax?: number;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function finiteOrZero(x: unknown): number {
  return isFiniteNumber(x) ? x : 0;
}

function finiteOrDefault(x: unknown, def: number): number {
  return isFiniteNumber(x) ? x : def;
}

function normalizeClampBounds(model?: StellarVariabilityParams): { min: number; max: number } {
  // Defaults keep backward behavior.
  const min0 = finiteOrDefault(model?.clampMin, -1e3);
  const max0 = finiteOrDefault(model?.clampMax, 1e3);

  // If user swaps them or provides nonsense, fall back to defaults.
  if (!Number.isFinite(min0) || !Number.isFinite(max0)) return { min: -1e3, max: 1e3 };
  if (min0 === max0) return { min: -1e3, max: 1e3 };

  const min = Math.min(min0, max0);
  const max = Math.max(min0, max0);

  // Avoid a pathological infinite clamp (would be pointless).
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1e3, max: 1e3 };
  return { min, max };
}

/**
 * Compute an orbital phase angle phi(t) in [0, 2π) from (period, t0).
 *
 * Convention:
 *   phi = wrapTo2Pi( 2π * (t - t0) / period )
 *
 * Notes:
 * - For circular orbits this corresponds to a mean-anomaly-like linear phase. 
 * - For eccentric orbits, this is NOT equal to true anomaly; it remains a convenient toy phase. 
 */
export function orbitalPhaseFromPeriod(params: { t: number; period: number; t0: number }): number {
  const { t, period, t0 } = params;
  if (!Number.isFinite(t) || !Number.isFinite(period) || !Number.isFinite(t0)) return NaN;
  if (period <= 0) return NaN;

  const phi = (2 * Math.PI * (t - t0)) / period;
  return wrapTo2Pi(phi);
}

/**
 * Compute a "true-anomaly phase" phi(t) in [0, 2π) by solving Kepler’s equation.
 *
 * Implementation:
 * - Mean anomaly: M = 2π * (t - t0) / period
 * - Eccentric anomaly: E = solveKeplerE(M, e)
 * - True anomaly: nu = trueAnomalyFromE(E, e)
 * - Return wrapTo2Pi(nu)
 *
 * Notes / limitations:
 * - This better reflects orbital angular speed variation when e != 0. 
 * - It still ignores argument of periapsis, inclination projection, and detailed physical response, so
 *   it should be treated as an improved toy phase rather than a physically exact beaming/ellipsoidal model. 
 */
export function orbitalPhaseFromTrueAnomaly(params: {
  t: number;
  period: number;
  t0: number;
  e: number;
}): number {
  const { t, period, t0, e } = params;
  if (!Number.isFinite(t) || !Number.isFinite(period) || !Number.isFinite(t0) || !Number.isFinite(e)) return NaN;
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

  // Fast no-op.
  if (beamingAmp === 0 && ellipAmp === 0 && constant === 0) return 0;

  const phaseModel: StellarVariabilityPhaseModel = model.phaseModel ?? "linear-period";

  let phi: number;
  if (phaseModel === "true-anomaly") {
    // Eccentric-orbit aware phase (still toy-correct as a photometric model). 
    phi = orbitalPhaseFromTrueAnomaly({ t, period: P, t0, e: orbit.e });
  } else {
    // Default (and previous behavior): linear in time. 
    phi = orbitalPhaseFromPeriod({ t, period: P, t0 });
  }

  if (!Number.isFinite(phi)) return 0;

  const beamingOffset = finiteOrZero(model.beamingOffset);
  const ellipOffset = finiteOrZero(model.ellipsoidalOffset);

  // Compute terms:
  // - Beaming: first harmonic
  // - Ellipsoidal: second harmonic
  const termBeaming = beamingAmp * Math.sin(phi + beamingOffset);
  const termEllip = ellipAmp * Math.cos(2 * (phi + ellipOffset));

  const out = constant + termBeaming + termEllip;
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
    const phiLin = orbitalPhaseFromPeriod({ t, period: orbitCirc.period, t0: orbitCirc.t0 });
    const phiTA = orbitalPhaseFromTrueAnomaly({ t, period: orbitCirc.period, t0: orbitCirc.t0, e: orbitCirc.e });
    assert(Number.isFinite(phiLin) && Number.isFinite(phiTA), "Phases must be finite for e=0.");
    // They may differ by wrap behavior at 2π boundaries; compare wrapped difference.
    const d = wrapTo2Pi(phiLin - phiTA);
    assert(approxEq(d, 0, 1e-10) || approxEq(d, 2 * Math.PI, 1e-10), "e=0 phases should match.");
  }

  const f = stellarVariabilityFlux({
    t: 3,
    orbit: orbitCirc,
    model: { enabled: true, beamingAmp: 1e-4, ellipsoidalAmp: 2e-4, constant: 0, phaseModel: "linear-period" },
  });
  assert(Number.isFinite(f), "Flux must be finite for typical settings.");
}
