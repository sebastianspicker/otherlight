// src/physics/kepler.ts

//
// Elliptic-orbit anomaly utilities (e in [0,1)).
// Conventions:
// - Angles are in radians.
// - Returned angles are wrapped to (-pi, pi] via wrapToPi.

import { wrapToPi } from "../core/units";

export type SolveKeplerEOptions = {
  /** Max Newton iterations. Default: 30. */
  maxIters?: number;
  /** Convergence tolerance on residual/step. Default: 1e-12. */
  tol?: number;
  /**
   * If true: throw when the solver does not converge within maxIters
   * (useful for scientific runs/tests).
   * If false/omitted: return best-effort value (UI-friendly).
   */
  strict?: boolean;
};

export type KeplerSolveDiagnostics = {
  /**
   * Enable diagnostic logging for slow/step-limited solves.
   * Default: false/undefined (no logging).
   */
  enabled?: boolean;
  /**
   * Custom logger; defaults to console.debug when enabled.
   */
  logger?: (msg: string) => void;
  /**
   * Log when Newton iterations reach/exceed this count.
   * Default: 12
   */
  warnIterCount?: number;
  /**
   * Log when the step limiter (|dE| capped to MAX_STEP) triggers this often.
   * Default: 6
   */
  warnStepLimitedCount?: number;
};

/**
 * Solve Kepler's equation for elliptic orbits:
 * M = E - e sin(E)
 * via (damped) Newton iterations.
 *
 * @param M Mean anomaly [rad] (any real).
 * @param e Eccentricity in [0, 1).
 * @param maxItersOrOpts Options object or legacy maxIters number.
 * @param tolArg Legacy tolerance argument (ignored if opts object is provided).
 * @param diag Optional diagnostics (logs only if diag.enabled === true).
 */
export function solveKeplerE(
  M: number,
  e: number,
  maxItersOrOpts: number | SolveKeplerEOptions = 30,
  tolArg = 1e-12,
  diag?: KeplerSolveDiagnostics,
): number {
  if (!Number.isFinite(M) || !Number.isFinite(e)) {
    throw new Error("solveKeplerE: M and e must be finite numbers.");
  }
  if (e < 0 || e >= 1) {
    throw new Error("solveKeplerE: elliptic solver requires e in [0, 1).");
  }

  // Backwards-compatible parameter handling:
  // - legacy: solveKeplerE(M,e,maxIters,tol)
  // - new: solveKeplerE(M,e,{maxIters,tol,strict})
  const opts: SolveKeplerEOptions | undefined =
    typeof maxItersOrOpts === "object" && maxItersOrOpts !== null ? maxItersOrOpts : undefined;

  const maxItersRaw = opts ? opts.maxIters : (maxItersOrOpts as number);
  const tolRaw = opts ? opts.tol : tolArg;
  const strict = Boolean(opts?.strict);

  // Sanitize numeric controls.
  let maxIters = Number.isFinite(maxItersRaw ?? Number.NaN)
    ? Math.max(1, Math.floor(maxItersRaw as number))
    : 30;
  // High-eccentricity orbits (e > 0.95) converge much more slowly;
  // ensure at least 60 iterations to avoid premature non-convergence.
  if (e > 0.95) {
    maxIters = Math.max(maxIters, 60);
  }
  const tol = Number.isFinite(tolRaw ?? Number.NaN) ? Math.max(0, tolRaw as number) : 1e-12;

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
    // Use epsilon check instead of exact zero to handle floating-point near-zero values.
    E = Math.abs(Mw) < 1e-12 ? 0 : Math.sign(Mw) * Math.PI;
  }
  E = wrapToPi(E);

  // Damping / step limit:
  // A conservative cap stabilizes iterations when f'(E)=1-e cosE is tiny.
  const MAX_STEP = 1.0; // rad, empirically stable for interactive simulation

  // Diagnostics (opt-in)
  const diagEnabled = Boolean(diag?.enabled);
  const logger = diag?.logger ?? console.debug.bind(console);
  const warnIterCount = Number.isFinite(diag?.warnIterCount ?? Number.NaN)
    ? Math.max(1, Math.floor(diag!.warnIterCount as number))
    : 12;
  const warnStepLimitedCount = Number.isFinite(diag?.warnStepLimitedCount ?? Number.NaN)
    ? Math.max(0, Math.floor(diag!.warnStepLimitedCount as number))
    : 6;

  let stepLimitedCount = 0;
  let lastAbsF = Number.POSITIVE_INFINITY;
  let lastAbsDE = Number.POSITIVE_INFINITY;

  const maybeLog = (itersUsed: number, finalE: number, absF: number, absDE: number) => {
    if (!diagEnabled) return;
    if (itersUsed < warnIterCount && stepLimitedCount < warnStepLimitedCount) return;
    logger(
      [
        "solveKeplerE diagnostics:",
        `e=${e.toFixed(6)}`,
        `M=${M.toFixed(6)}`,
        `Mw=${Mw.toFixed(6)}`,
        `iters=${itersUsed}/${maxIters}`,
        `stepLimited=${stepLimitedCount}`,
        `|f|=${absF.toExponential(3)}`,
        `|dE|=${absDE.toExponential(3)}`,
        `E=${wrapToPi(finalE).toFixed(6)}`,
      ].join(" "),
    );
  };

  for (let k = 0; k < maxIters; k++) {
    const s = Math.sin(E);
    const c = Math.cos(E);

    // f(E) = E - e sin(E) - M
    const f = E - e * s - Mw;
    const absF = Math.abs(f);
    lastAbsF = absF;

    // Converged in residual (useful when tol is small)
    if (absF <= tol) {
      maybeLog(k + 1, E, absF, lastAbsDE);
      return wrapToPi(E);
    }

    // f'(E) = 1 - e cos(E)
    let fp = 1 - e * c;

    // ------------------------------------------------------------------
    // NUMERICAL HARDENING
    // When e -> 1 and E -> 0, fp -> 0. This causes division by zero or
    // massive jumps. We regularize fp by enforcing a minimum magnitude.
    // ------------------------------------------------------------------
    let dE: number;
    if (Math.abs(fp) < 1e-14) {
      // Regularize: preserve sign, but enforce min magnitude.
      // If fp is exactly 0, use sign of f to move away from root (rare).
      const sign = fp === 0 ? (f > 0 ? 1 : -1) : Math.sign(fp);
      fp = sign * 1e-14;
    }

    // Standard Newton step
    dE = -f / fp;

    // Limit step size (damping)
    if (Math.abs(dE) > MAX_STEP) {
      dE = Math.sign(dE) * MAX_STEP;
      stepLimitedCount++;
    }

    E = wrapToPi(E + dE);
    // Note: |dE| here is pre-wrap, so it reflects the Newton step magnitude
    // rather than the wrapped angular distance. This is benign because the
    // residual check (|f| <= tol) above catches convergence first; the step-
    // size check below is a secondary safeguard that terminates slightly
    // early at worst.
    const absDE = Math.abs(dE);
    lastAbsDE = absDE;

    // Converged in step size
    if (absDE <= tol) {
      maybeLog(k + 1, E, lastAbsF, absDE);
      return wrapToPi(E);
    }
  }

  // If we get here: not converged within maxIters.
  maybeLog(maxIters, E, lastAbsF, lastAbsDE);

  // Not converged.
  if (strict) {
    const s = Math.sin(E);
    const f = E - e * s - Mw;
    throw new Error(
      `solveKeplerE: did not converge within maxIters=${maxIters} (|f|=${Math.abs(
        f,
      )}; tol=${tol}; e=${e}; M=${M}).`,
    );
  }

  // Best-effort return for interactive usage.
  return wrapToPi(E);
}

/** Mean motion n = 2π / P [rad/s]. */
function meanMotionFromPeriod(period: number): number {
  if (!Number.isFinite(period) || period <= 0) {
    throw new Error("meanMotionFromPeriod: period must be > 0 and finite.");
  }
  return (2 * Math.PI) / period;
}

/** Kepler's third law: mu = n^2 * a^3 (for a two-body orbit). */
export function muFromPeriodAndA(period: number, a: number): number {
  if (!Number.isFinite(a) || a <= 0) {
    throw new Error("muFromPeriodAndA: a must be > 0 and finite.");
  }
  const n = meanMotionFromPeriod(period);
  const mu = n * n * a * a * a;
  return Number.isFinite(mu) ? mu : NaN;
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
 * r = a (1 - e cosE)
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

/* -----------------------------
 * Minimal built-in tests
 * ----------------------------- */

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`kepler self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-10): boolean {
  return Math.abs(a - b) <= eps;
}

export function runKeplerSelfTests(): void {
  // e=0 => E=M wrapped.
  const M0 = 1.234;
  const E0 = solveKeplerE(M0, 0);
  assert(approxEq(E0, wrapToPi(M0), 1e-12), "e=0 should give E=M.");

  // Generic residual check.
  const M1 = 2.1;
  const e1 = 0.3;
  const E1 = solveKeplerE(M1, e1, { maxIters: 60, tol: 1e-12, strict: true });
  const f = E1 - e1 * Math.sin(E1) - wrapToPi(M1);
  assert(Math.abs(f) < 1e-10, "Kepler residual should be small.");

  // True anomaly for e=0 reduces to E (wrapped).
  const nu0 = trueAnomalyFromE(E0, 0);
  assert(approxEq(nu0, wrapToPi(E0), 1e-12), "nu should equal E for e=0.");

  // Radius sanity.
  const r = radiusFromE(2, 0.5, 0);
  assert(approxEq(r, 1, 1e-12), "radiusFromE should match a(1-e) at E=0.");
}
