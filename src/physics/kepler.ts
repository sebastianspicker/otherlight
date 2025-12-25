// src/physics/kepler.ts
//
// Elliptic-orbit anomaly utilities (e in [0,1)).
//
// Conventions / return domains
// ----------------------------
// - All angles are radians.
// - This module’s public angular outputs are wrapped to (-π, π] via wrapToPi.
//   This is convenient for numerical solvers and “small-angle” comparisons.
//
// Compatibility note (wrap domain)
// -------------------------------
// Some downstream code may prefer [0, 2π) phases. In that case, callers should convert
// using wrapTo2Pi(...) from src/core/units.ts. This module intentionally standardizes on
// (-π, π] to avoid discontinuities at 2π in Newton updates and atan2-derived angles.
//
// Numerical robustness goals
// --------------------------
// - e → 0: returns E ≈ M (exactly wrapped).
// - e → 0.99: stable Newton behavior via:
//   - good initial guess,
//   - step limiting,
//   - derivative guard when f'(E) is tiny.
// - large |M|: always reduce M with wrapToPi first (so trig calls remain well-conditioned).

import { wrapToPi } from "../core/units";

/**
 * Solve Kepler's equation for elliptic orbits:
 *   M = E - e sin(E)
 * using a damped Newton method.
 *
 * Return domain: E is wrapped to (-π, π].
 *
 * @param M Mean anomaly [rad] (any real).
 * @param e Eccentricity in [0, 1).
 * @param maxIters Maximum iterations (default 30).
 * @param tol Convergence tolerance (default 1e-12). Used on both |ΔE| and |f(E)|.
 */
export function solveKeplerE(M: number, e: number, maxIters = 30, tol = 1e-12): number {
  if (!Number.isFinite(M) || !Number.isFinite(e)) {
    throw new Error("solveKeplerE: M and e must be finite numbers.");
  }
  if (e < 0 || e >= 1) {
    throw new Error("solveKeplerE: elliptic solver requires e in [0, 1).");
  }

  // Sanitize numeric controls.
  maxIters = Number.isFinite(maxIters) ? Math.max(1, Math.floor(maxIters)) : 30;
  tol = Number.isFinite(tol) ? Math.max(0, tol) : 1e-12;

  // Reduce M first to keep trig evaluations stable even for huge |M|.
  const Mw = wrapToPi(M);

  // e -> 0 : E = M exactly (in the chosen wrap domain).
  // Using a threshold avoids sensitivity to e being "almost zero" from UI parsing.
  if (e === 0) return Mw;

  // Initial guess:
  // - For modest e: use a one-step series-improved starter around M.
  // - For high e: start near ±π (or 0 if Mw == 0) to reduce large Newton jumps.
  let E: number;
  if (e < 0.8) {
    // E ≈ M + e sin(M) (1 + e cos(M))  (good cheap starter for small/moderate e)
    E = Mw + e * Math.sin(Mw) * (1 + e * Math.cos(Mw));
  } else {
    // High-e starter: choose side based on Mw sign; Mw==0 -> 0.
    E = Mw === 0 ? 0 : Math.sign(Mw) * Math.PI;
  }
  E = wrapToPi(E);

  // Step limit (damping):
  // - When e is close to 1 and E is near 0, f'(E)=1-e cosE can be very small,
  //   making Newton steps enormous. A step cap stabilizes interactive usage.
  //
  // Keep it conservative; convergence still happens in a few iterations for typical use.
  const MAX_STEP = 1.0; // rad

  // Guard for tiny derivative.
  const FP_EPS = 1e-14;

  for (let k = 0; k < maxIters; k++) {
    const s = Math.sin(E);
    const c = Math.cos(E);

    // f(E) = E - e sin(E) - M
    const f = E - e * s - Mw;

    // Converged by residual.
    if (Math.abs(f) <= tol) return wrapToPi(E);

    // f'(E) = 1 - e cos(E)
    const fp = 1 - e * c;

    let dE: number;

    if (!Number.isFinite(fp) || Math.abs(fp) < FP_EPS) {
      // Derivative nearly zero (or invalid): take a tiny step that reduces |f|
      // directionally rather than exploding.
      //
      // Note: sign(0) is 0; in that rare case, fall back to a deterministic tiny step.
      const sgn = Math.sign(f);
      dE = sgn !== 0 ? -sgn * 1e-3 : 1e-3;
    } else {
      dE = -f / fp;
    }

    // Limit step size (damping).
    if (Math.abs(dE) > MAX_STEP) dE = Math.sign(dE) * MAX_STEP;

    const E2 = wrapToPi(E + dE);

    // Converged by step size.
    if (Math.abs(dE) <= tol) return E2;

    // Optional safety: if update produced a non-finite value (should not happen with wrapping),
    // stop and return best effort.
    if (!Number.isFinite(E2)) return wrapToPi(E);

    E = E2;
  }

  // Best-effort return for interactive usage (alternatively: throw).
  return wrapToPi(E);
}

/**
 * Convert eccentric anomaly E -> true anomaly ν for elliptic orbits (quadrant safe).
 *
 * Return domain: ν is wrapped to (-π, π].
 *
 * Notes:
 * - For e=0 (circular), ν and E coincide up to a constant offset convention; here
 *   the standard formula reduces to ν = atan2(sinE, cosE) = E (wrapped).
 */
export function trueAnomalyFromE(E: number, e: number): number {
  if (!Number.isFinite(E) || !Number.isFinite(e)) {
    throw new Error("trueAnomalyFromE: E and e must be finite numbers.");
  }
  if (e < 0 || e >= 1) {
    throw new Error("trueAnomalyFromE: elliptic conversion requires e in [0, 1).");
  }

  // Keep trig stable and downstream consistent: work with wrapped E.
  const Ew = wrapToPi(E);

  const sinE = Math.sin(Ew);
  const cosE = Math.cos(Ew);

  // ν = atan2( sqrt(1-e^2) sinE, cosE - e )
  const y = Math.sqrt(1 - e * e) * sinE;
  const x = cosE - e;

  return wrapToPi(Math.atan2(y, x));
}

/**
 * Radius r from eccentric anomaly for an ellipse:
 *   r = a (1 - e cosE)
 *
 * Return domain: r is a non-negative length in the caller’s units (for valid a>0 and e in [0,1)).
 *
 * Notes:
 * - This function does not wrap E; cos(E) is periodic anyway.
 * - For high e near 1, r can become very small near periapsis (E≈0); that is physical.
 */
export function radiusFromE(a: number, e: number, E: number): number {
  if (!Number.isFinite(a) || a <= 0) {
    throw new Error("radiusFromE: a must be a positive finite number.");
  }
  if (!Number.isFinite(e) || e < 0 || e >= 1) {
    throw new Error("radiusFromE: e must be in [0, 1).");
  }
  if (!Number.isFinite(E)) {
    throw new Error("radiusFromE: E must be a finite number.");
  }
  return a * (1 - e * Math.cos(E));
}
