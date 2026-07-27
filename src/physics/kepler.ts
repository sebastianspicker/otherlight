/** Solves elliptic Kepler motion in radians with explicit convergence behavior. */

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

type ResolvedKeplerOptions = {
  maxIters: number;
  tol: number;
  strict: boolean;
};

type ResolvedKeplerDiagnostics = {
  enabled: boolean;
  logger: (msg: string) => void;
  warnIterCount: number;
  warnStepLimitedCount: number;
};

type KeplerIterationRun = {
  E: number;
  converged: boolean;
  iterationsUsed: number;
  stepLimitedCount: number;
  lastAbsF: number;
  lastAbsDE: number;
};

const HIGH_ECCENTRICITY_MIN_ITERS = 60;
const MAX_NEWTON_STEP_RAD = 1.0;
const DERIVATIVE_FLOOR = 1e-14;

function assertEllipticKeplerInputs(M: number, e: number): void {
  if (!Number.isFinite(M) || !Number.isFinite(e)) {
    throw new Error("solveKeplerE: M and e must be finite numbers.");
  }
  if (e < 0 || e >= 1) {
    throw new Error("solveKeplerE: elliptic solver requires e in [0, 1).");
  }
}

function resolveKeplerOptions(
  maxItersOrOpts: number | SolveKeplerEOptions,
  tolArg: number,
  e: number,
): ResolvedKeplerOptions {
  const opts = typeof maxItersOrOpts === "object" && maxItersOrOpts !== null ? maxItersOrOpts : undefined;
  const maxItersRaw: number | undefined = opts ? opts.maxIters : (maxItersOrOpts as number);
  const tolRaw = opts ? opts.tol : tolArg;
  const minIters = e > 0.95 ? HIGH_ECCENTRICITY_MIN_ITERS : 1;
  return {
    maxIters: Math.max(minIters, finiteFloorAtLeast(maxItersRaw, 30, 1)),
    tol: finiteNonNegativeOrDefault(tolRaw, 1e-12),
    strict: Boolean(opts?.strict),
  };
}

function finiteFloorAtLeast(value: number | undefined, fallback: number, min: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.floor(value as number)) : fallback;
}

function finiteNonNegativeOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

function initialEccentricAnomaly(Mw: number, e: number): number {
  if (e < 0.8) return wrapToPi(Mw + e * Math.sin(Mw) * (1 + e * Math.cos(Mw)));
  return wrapToPi(Math.abs(Mw) < 1e-12 ? 0 : Math.sign(Mw) * Math.PI);
}

function resolveKeplerDiagnostics(diag: KeplerSolveDiagnostics | undefined): ResolvedKeplerDiagnostics {
  return {
    enabled: Boolean(diag?.enabled),
    logger: diag?.logger ?? console.debug.bind(console),
    warnIterCount: finiteFloorAtLeast(diag?.warnIterCount, 12, 1),
    warnStepLimitedCount: finiteFloorAtLeast(diag?.warnStepLimitedCount, 6, 0),
  };
}

function maybeLogKeplerDiagnostics(
  diag: ResolvedKeplerDiagnostics,
  context: {
    M: number;
    Mw: number;
    e: number;
    maxIters: number;
    run: KeplerIterationRun;
  },
): void {
  if (!diag.enabled) return;
  if (
    context.run.iterationsUsed < diag.warnIterCount &&
    context.run.stepLimitedCount < diag.warnStepLimitedCount
  )
    return;
  diag.logger(formatKeplerDiagnostics(context));
}

function formatKeplerDiagnostics(context: {
  M: number;
  Mw: number;
  e: number;
  maxIters: number;
  run: KeplerIterationRun;
}): string {
  const run = context.run;
  return [
    "solveKeplerE diagnostics:",
    `e=${context.e.toFixed(6)}`,
    `M=${context.M.toFixed(6)}`,
    `Mw=${context.Mw.toFixed(6)}`,
    `iters=${run.iterationsUsed}/${context.maxIters}`,
    `stepLimited=${run.stepLimitedCount}`,
    `|f|=${run.lastAbsF.toExponential(3)}`,
    `|dE|=${run.lastAbsDE.toExponential(3)}`,
    `E=${wrapToPi(run.E).toFixed(6)}`,
  ].join(" ");
}

function keplerResidual(E: number, e: number, Mw: number): number {
  return E - e * Math.sin(E) - Mw;
}

function regularizedDerivative(fp: number, f: number): number {
  if (Math.abs(fp) >= DERIVATIVE_FLOOR) return fp;
  const sign = fp === 0 ? (f > 0 ? 1 : -1) : Math.sign(fp);
  return sign * DERIVATIVE_FLOOR;
}

function limitedNewtonStep(f: number, fp: number): { dE: number; limited: boolean } {
  const rawStep = -f / fp;
  if (Math.abs(rawStep) <= MAX_NEWTON_STEP_RAD) return { dE: rawStep, limited: false };
  return { dE: Math.sign(rawStep) * MAX_NEWTON_STEP_RAD, limited: true };
}

function runKeplerNewtonIterations(
  Mw: number,
  e: number,
  maxIters: number,
  tol: number,
  initialE: number,
): KeplerIterationRun {
  let E = initialE;
  let stepLimitedCount = 0;
  let lastAbsF = Number.POSITIVE_INFINITY;
  let lastAbsDE = Number.POSITIVE_INFINITY;

  for (let k = 0; k < maxIters; k++) {
    const f = keplerResidual(E, e, Mw);
    lastAbsF = Math.abs(f);
    if (lastAbsF <= tol)
      return { E, converged: true, iterationsUsed: k + 1, stepLimitedCount, lastAbsF, lastAbsDE };

    const fp = regularizedDerivative(1 - e * Math.cos(E), f);
    const step = limitedNewtonStep(f, fp);
    if (step.limited) stepLimitedCount++;
    E = wrapToPi(E + step.dE);
    lastAbsDE = Math.abs(step.dE);
    if (lastAbsDE <= tol)
      return { E, converged: true, iterationsUsed: k + 1, stepLimitedCount, lastAbsF, lastAbsDE };
  }

  return { E, converged: false, iterationsUsed: maxIters, stepLimitedCount, lastAbsF, lastAbsDE };
}

function throwStrictKeplerNonConvergence(
  run: KeplerIterationRun,
  params: { maxIters: number; tol: number; e: number; M: number; Mw: number },
): never {
  const f = keplerResidual(run.E, params.e, params.Mw);
  throw new Error(
    `solveKeplerE: did not converge within maxIters=${params.maxIters} (|f|=${Math.abs(
      f,
    )}; tol=${params.tol}; e=${params.e}; M=${params.M}).`,
  );
}

/**
 * Solves elliptic Kepler's equation M = E - e sin(E) in radians using damped Newton iterations.
 * Inputs are validated strictly; a non-convergent strict solve throws, while non-strict mode returns its bounded estimate.
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
  assertEllipticKeplerInputs(M, e);
  if (e === 0) return wrapToPi(M);

  const options = resolveKeplerOptions(maxItersOrOpts, tolArg, e);
  const Mw = wrapToPi(M);
  const run = runKeplerNewtonIterations(Mw, e, options.maxIters, options.tol, initialEccentricAnomaly(Mw, e));
  const diagnostics = resolveKeplerDiagnostics(diag);

  maybeLogKeplerDiagnostics(diagnostics, { M, Mw, e, maxIters: options.maxIters, run });
  if (run.converged) return wrapToPi(run.E);
  if (options.strict) throwStrictKeplerNonConvergence(run, { ...options, e, M, Mw });

  return wrapToPi(run.E);
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
