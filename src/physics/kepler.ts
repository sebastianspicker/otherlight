// src/physics/kepler.ts
//
// Elliptic-orbit anomaly utilities (e in [0,1)).
// Conventions:
// - Angles are in radians.
// - Returned angles are wrapped to (-pi, pi] via wrapToPi.

import { wrapToPi } from "../core/units";

/**
 * Solve Kepler's equation for elliptic orbits:
 *   M = E - e sin(E)
 * via (damped) Newton iterations.
 *
 * @param M Mean anomaly [rad] (any real).
 * @param e Eccentricity in [0, 1).
 * @param maxIters Maximum iterations (default 30).
 * @param tol Convergence tolerance on |ΔE| and |f(E)| (default 1e-12).
 */
export function solveKeplerE(
  M: number,
  e: number,
  maxIters = 30,
  tol = 1e-12
): number {
  if (!Number.isFinite(M) || !Number.isFinite(e)) {
    throw new Error("solveKeplerE: M and e must be finite numbers.");
  }
  if (e < 0 || e >= 1) {
    throw new Error("solveKeplerE: elliptic solver requires e in [0, 1).");
  }

  // sanitize numeric controls
  maxIters = Number.isFinite(maxIters) ? Math.max(1, Math.floor(maxIters)) : 30;
  tol = Number.isFinite(tol) ? Math.max(0, tol) : 1e-12;

  // e = 0 -> E = M exactly
  if (e === 0) return wrapToPi(M);

  const Mw = wrapToPi(M);

  // Initial guess:
  // - For modest e: series-improved starter around M.
  // - For high e: start near +/-pi depending on the sign of M to reduce large jumps.
  let E: number;
  if (e < 0.8) {
    // A simple improved starter: E ≈ M + e sin(M) (1 + e cos(M))
    E = Mw + e * Math.sin(Mw) * (1 + e * Math.cos(Mw));
  } else {
    // Better than always +pi: choose the closer side in wrapped space.
    // If Mw is ~0, start at 0 (good near periapsis/apoapsis symmetry).
    E = Mw === 0 ? 0 : Math.sign(Mw) * Math.PI;
  }

  E = wrapToPi(E);

  // Damping / step limit:
  // A conservative cap stabilizes iterations when f'(E)=1-e cosE is tiny.
  const MAX_STEP = 1.0; // rad, empirically stable for interactive simulation

  for (let k = 0; k < maxIters; k++) {
    const s = Math.sin(E);
    const c = Math.cos(E);

    // f(E) = E - e sin(E) - M
    const f = E - e * s - Mw;

    // Converged in residual (useful when tol is small)
    if (Math.abs(f) <= tol) return wrapToPi(E);

    // f'(E) = 1 - e cos(E)
    const fp = 1 - e * c;

    // If derivative is extremely small, do a damped step to avoid blow-ups.
    // (We avoid dividing by ~0; Newton can otherwise jump wildly.)
    let dE: number;
    if (Math.abs(fp) < 1e-14) {
      // Move a tiny step opposite the residual sign to escape the singular region.
      dE = -Math.sign(f) * 1e-3;
    } else {
      dE = -f / fp;
    }

    // Limit step size (damping)
    if (Math.abs(dE) > MAX_STEP) dE = Math.sign(dE) * MAX_STEP;

    E = wrapToPi(E + dE);

    if (Math.abs(dE) <= tol) return wrapToPi(E);
  }

  // Best-effort return for interactive usage (alternatively: throw).
  return wrapToPi(E);
}

/**
 * Convert eccentric anomaly E -> true anomaly ν for elliptic orbits (quadrant safe).
 */
export function trueAnomalyFromE(E: number, e: number): number {
  if (!Number.isFinite(E) || !Number.isFinite(e)) {
    throw new Error("trueAnomalyFromE: E and e must be finite numbers.");
  }
  if (e < 0 || e >= 1) {
    throw new Error("trueAnomalyFromE: elliptic conversion requires e in [0, 1).");
  }

  const sinE = Math.sin(E);
  const cosE = Math.cos(E);

  // ν = atan2( sqrt(1-e^2) sinE, cosE - e )
  const y = Math.sqrt(1 - e * e) * sinE;
  const x = cosE - e;

  return wrapToPi(Math.atan2(y, x));
}

/**
 * Radius r from eccentric anomaly for an ellipse:
 *   r = a (1 - e cosE)
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
