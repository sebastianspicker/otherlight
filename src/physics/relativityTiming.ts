/** Converts relativistic orbital corrections into transit-timing observables. */
//
// Lightweight relativity-inspired timing and precession utilities.
//
// Notes:
// - These are toy-model corrections intended for timing offsets and simple apsidal precession.
// - Speed of light `c` must be provided in SI units (m/s).

import type { RelativityParams } from "../core/typesDynamics";
import { evaluateShapiroDelay, evaluateShapiroDelayMultiBody } from "./relativityShapiro";
import type { Vec3 } from "./vec3";
import { vDot, vIsFinite, vLen, vNormalizeOrZero } from "./vec3";
export { grPrecessionPerOrbit, resolveGrPrecessionPerOrbit } from "./relativityPrecession";

export type { RelativityParams };

export type NormalizedRelativityParams = {
  enabled: boolean;
  ltte: boolean;
  grPrecession: boolean;
  shapiro: boolean;
  c: number;
  planetPrecessionPerOrbit: number;
  moonPrecessionPerOrbit: number;
  ltteIters: number;
  ltteTolSec: number;
  shapiroMinImpact: number;
};

export type LightTimeSolveDiagnostics = {
  status: "converged" | "max-iters" | "invalid-input" | "nonfinite-delay" | "nonfinite-next";
  converged: boolean;
  iterations: number;
  maxIters: number;
  tolSec: number;
  usedShapiro: boolean;
  usedMultiBodyShapiro: boolean;
  validityFlags: string[];
  roemerSec?: number;
  shapiroSec?: number;
  delaySec?: number;
  residualSec?: number;
};

export type LightTimeSolveResult = {
  tEmit: number;
  diagnostics: LightTimeSolveDiagnostics;
};

type LightTimeSolveInput = {
  tObs: number;
  rAtTime: (t: number) => Vec3;
  observerDir: Vec3;
  c: number;
  shapiro?: {
    enabled: boolean;
    mu?: number;
    minImpact?: number;
    massesAtTime?: (t: number) => Array<{ mu: number; r: Vec3 }>;
  };
  maxIters?: number;
  tolSec?: number;
};

type LightTimeDelayEvaluation = {
  roemerSec?: number;
  shapiroSec?: number;
  delaySec?: number;
  shapiroImpactFloorEngaged: boolean;
};

type LightTimeSolveResultDetails = {
  status: LightTimeSolveDiagnostics["status"];
  converged: boolean;
  iterations: number;
  maxIters: number;
  tolSec: number;
  usedShapiro: boolean;
  usedMultiBodyShapiro: boolean;
  validityFlags: string[];
  timing?: Pick<LightTimeSolveDiagnostics, "roemerSec" | "shapiroSec" | "delaySec" | "residualSec">;
};

type NormalizedLightTimeSolveSettings = {
  maxIters: number;
  maxItersImplicit: boolean;
  tolSec: number;
  tolSecImplicit: boolean;
  shapiroMinImpact: number;
};

type LightTimeTerminalResultContext = {
  params: LightTimeSolveInput;
  tObs: number;
  maxIters: number;
  tolSec: number;
  useShapiro: boolean;
  useMultiBodyShapiro: boolean;
  shapiroMinImpact: number;
};

type LightTimeIterationState = {
  tEmit: number;
  iterations: number;
  lastRoemer?: number;
  lastShapiro?: number;
  lastDelay?: number;
  sawShapiroImpactFloor: boolean;
};

type LightTimeIterationOutcome =
  | { kind: "next"; tEmit: number }
  | { kind: "result"; result: LightTimeSolveResult };

const DEFAULT_LTTE_ITERS = 2;
const DEFAULT_LTTE_TOL_SEC = 1e-6;
const DEFAULT_SHAPIRO_MIN_IMPACT = 0;

export function buildLightTimeValidityFlags(args: {
  useShapiro: boolean;
  useMultiBodyShapiro: boolean;
  maxIters: number;
  maxItersImplicit: boolean;
  tolSecImplicit: boolean;
  shapiroMinImpact: number;
}): string[] {
  const flags: string[] = [];
  if (args.maxItersImplicit) flags.push("implicit-ltte-iteration-budget");
  if (args.tolSecImplicit) flags.push("implicit-ltte-tolerance");
  if (args.maxIters <= DEFAULT_LTTE_ITERS) flags.push("weak-ltte-iteration-budget");
  if (args.useShapiro) {
    flags.push("relative-shapiro-delay");
    flags.push(args.useMultiBodyShapiro ? "weak-field-multi-body-shapiro-sum" : "single-point-mass-shapiro");
    if (!(args.shapiroMinImpact > 0)) flags.push("unregularized-shapiro-impact");
  }
  return flags;
}

export function normalizeLightTimeSolveSettings(
  params: LightTimeSolveInput,
): NormalizedLightTimeSolveSettings {
  const maxItersImplicit = !Number.isFinite(params.maxIters);
  const tolSecImplicit = !Number.isFinite(params.tolSec);
  return {
    maxIters: maxItersImplicit ? DEFAULT_LTTE_ITERS : Math.max(1, Math.floor(params.maxIters!)),
    maxItersImplicit,
    tolSec: tolSecImplicit ? DEFAULT_LTTE_TOL_SEC : Math.max(0, params.tolSec!),
    tolSecImplicit,
    shapiroMinImpact: Number.isFinite(params.shapiro?.minImpact)
      ? Math.max(0, params.shapiro!.minImpact as number)
      : DEFAULT_SHAPIRO_MIN_IMPACT,
  };
}

export function evaluateLightTimeDelayAtTime(args: {
  params: LightTimeSolveInput;
  tEval: number;
  useShapiro: boolean;
  shapiroMinImpact: number;
}): LightTimeDelayEvaluation {
  const r = args.params.rAtTime(args.tEval);
  const roemer = lightTimeDelaySec(r, args.params.observerDir, args.params.c);
  let shapiro = 0;
  let shapiroImpactFloorEngaged = false;
  if (args.useShapiro) {
    const massesAtTime = args.params.shapiro?.massesAtTime;
    if (typeof massesAtTime === "function") {
      const evaluated = evaluateShapiroDelayMultiBody({
        rBody: r,
        observerDir: args.params.observerDir,
        masses: massesAtTime(args.tEval),
        c: args.params.c,
        minImpact: args.shapiroMinImpact,
      });
      shapiro = evaluated.delaySec;
      shapiroImpactFloorEngaged = evaluated.impactFloorEngaged;
    } else if (Number.isFinite(args.params.shapiro?.mu) && (args.params.shapiro?.mu as number) > 0) {
      const evaluated = evaluateShapiroDelay({
        r,
        observerDir: args.params.observerDir,
        mu: args.params.shapiro!.mu as number,
        c: args.params.c,
        minImpact: args.shapiroMinImpact,
      });
      shapiro = evaluated.delaySec;
      shapiroImpactFloorEngaged = evaluated.impactFloorEngaged;
    }
  }
  const delay = roemer + shapiro;
  return {
    roemerSec: Number.isFinite(roemer) ? roemer : undefined,
    shapiroSec: Number.isFinite(shapiro) ? shapiro : undefined,
    delaySec: Number.isFinite(delay) ? delay : undefined,
    shapiroImpactFloorEngaged,
  };
}

export function buildLightTimeSolveResult(
  tEmit: number,
  details: LightTimeSolveResultDetails,
): LightTimeSolveResult {
  return {
    tEmit,
    diagnostics: {
      status: details.status,
      converged: details.converged,
      iterations: details.iterations,
      maxIters: details.maxIters,
      tolSec: details.tolSec,
      usedShapiro: details.usedShapiro,
      usedMultiBodyShapiro: details.usedMultiBodyShapiro,
      validityFlags: details.validityFlags,
      ...details.timing,
    },
  };
}

export function computeLightTimeResidualSec(args: {
  params: LightTimeSolveInput;
  tObs: number;
  tEmit: number;
  useShapiro: boolean;
  shapiroMinImpact: number;
}): number | undefined {
  if (!Number.isFinite(args.tEmit) || !Number.isFinite(args.tObs)) return undefined;
  const delay = evaluateLightTimeDelayAtTime({
    params: args.params,
    tEval: args.tEmit,
    useShapiro: args.useShapiro,
    shapiroMinImpact: args.shapiroMinImpact,
  }).delaySec;
  if (!(typeof delay === "number" && Number.isFinite(delay))) return undefined;
  const residual = Math.abs(args.tObs - (args.tEmit + delay));
  return Number.isFinite(residual) ? residual : undefined;
}

export function withResidualFlag(
  baseFlags: string[],
  residualSec: number | undefined,
  tolSec: number,
): string[] {
  const flags = [...baseFlags];
  if (Number.isFinite(residualSec) && (residualSec as number) > tolSec) {
    flags.push("residual-exceeds-tolerance");
  }
  return flags;
}

export function buildLightTimeTerminalResult(args: {
  context: LightTimeTerminalResultContext;
  tEmit: number;
  status: LightTimeSolveDiagnostics["status"];
  converged: boolean;
  iterations: number;
  validityFlags: string[];
  timing: Pick<LightTimeSolveDiagnostics, "roemerSec" | "shapiroSec" | "delaySec">;
}): LightTimeSolveResult {
  const residualSec = computeLightTimeResidualSec({
    params: args.context.params,
    tObs: args.context.tObs,
    tEmit: args.tEmit,
    useShapiro: args.context.useShapiro,
    shapiroMinImpact: args.context.shapiroMinImpact,
  });
  return buildLightTimeSolveResult(args.tEmit, {
    status: args.status,
    converged: args.converged,
    iterations: args.iterations,
    maxIters: args.context.maxIters,
    tolSec: args.context.tolSec,
    usedShapiro: args.context.useShapiro,
    usedMultiBodyShapiro: args.context.useMultiBodyShapiro,
    validityFlags: withResidualFlag(args.validityFlags, residualSec, args.context.tolSec),
    timing: { ...args.timing, residualSec },
  });
}

export function resolveLightTimeEmissionTime(tEmit: number, tObs: number): number {
  return Number.isFinite(tEmit) ? tEmit : tObs;
}

export function buildLightTimeIterationTerminalResult(args: {
  context: LightTimeTerminalResultContext;
  state: LightTimeIterationState;
  tEmit: number;
  status: LightTimeSolveDiagnostics["status"];
  converged: boolean;
  validityFlags: string[];
}): LightTimeSolveResult {
  return buildLightTimeTerminalResult({
    context: args.context,
    tEmit: args.tEmit,
    status: args.status,
    converged: args.converged,
    iterations: args.state.iterations,
    validityFlags: args.validityFlags,
    timing: {
      roemerSec: args.state.lastRoemer,
      shapiroSec: args.state.lastShapiro,
      delaySec: args.state.lastDelay,
    },
  });
}

export function resolveLightTimeIteration(args: {
  context: LightTimeTerminalResultContext;
  state: LightTimeIterationState;
  validityFlags: string[];
}): LightTimeIterationOutcome {
  const evaluated = evaluateLightTimeDelayAtTime({
    params: args.context.params,
    tEval: args.state.tEmit,
    useShapiro: args.context.useShapiro,
    shapiroMinImpact: args.context.shapiroMinImpact,
  });
  args.state.lastRoemer = evaluated.roemerSec;
  args.state.lastShapiro = evaluated.shapiroSec;
  args.state.lastDelay = evaluated.delaySec;
  args.state.sawShapiroImpactFloor ||= evaluated.shapiroImpactFloorEngaged;
  const dynamicValidityFlags = args.state.sawShapiroImpactFloor
    ? [...args.validityFlags, "shapiro-impact-floor-engaged"]
    : args.validityFlags;
  const delay = evaluated.delaySec;
  if (!(typeof delay === "number" && Number.isFinite(delay))) {
    return {
      kind: "result",
      result: buildLightTimeIterationTerminalResult({
        context: args.context,
        state: args.state,
        tEmit: resolveLightTimeEmissionTime(args.state.tEmit, args.context.tObs),
        status: "nonfinite-delay",
        converged: false,
        validityFlags: dynamicValidityFlags,
      }),
    };
  }

  const next = args.context.tObs - delay;
  if (!Number.isFinite(next)) {
    return {
      kind: "result",
      result: buildLightTimeIterationTerminalResult({
        context: args.context,
        state: args.state,
        tEmit: resolveLightTimeEmissionTime(args.state.tEmit, args.context.tObs),
        status: "nonfinite-next",
        converged: false,
        validityFlags: dynamicValidityFlags,
      }),
    };
  }
  if (Math.abs(next - args.state.tEmit) <= args.context.tolSec) {
    return {
      kind: "result",
      result: buildLightTimeIterationTerminalResult({
        context: args.context,
        state: args.state,
        tEmit: next,
        status: "converged",
        converged: true,
        validityFlags: dynamicValidityFlags,
      }),
    };
  }
  return { kind: "next", tEmit: next };
}

export function solveValidLightTimeCorrectedResult(
  params: LightTimeSolveInput,
  tObs: number,
  settings: NormalizedLightTimeSolveSettings,
): LightTimeSolveResult {
  const useShapiro = Boolean(params.shapiro?.enabled);
  const useMultiBodyShapiro = typeof params.shapiro?.massesAtTime === "function";
  const validityFlags = buildLightTimeValidityFlags({
    useShapiro,
    useMultiBodyShapiro,
    maxIters: settings.maxIters,
    maxItersImplicit: settings.maxItersImplicit,
    tolSecImplicit: settings.tolSecImplicit,
    shapiroMinImpact: settings.shapiroMinImpact,
  });
  const context: LightTimeTerminalResultContext = {
    params,
    tObs,
    maxIters: settings.maxIters,
    tolSec: settings.tolSec,
    useShapiro,
    useMultiBodyShapiro,
    shapiroMinImpact: settings.shapiroMinImpact,
  };
  const state: LightTimeIterationState = {
    tEmit: tObs,
    iterations: 0,
    sawShapiroImpactFloor: false,
  };
  for (let i = 0; i < settings.maxIters; i++) {
    state.iterations = i + 1;
    const outcome = resolveLightTimeIteration({ context, state, validityFlags });
    if (outcome.kind === "result") return outcome.result;
    state.tEmit = outcome.tEmit;
  }

  const finalValidityFlags = state.sawShapiroImpactFloor
    ? [...validityFlags, "shapiro-impact-floor-engaged"]
    : validityFlags;
  return buildLightTimeIterationTerminalResult({
    context,
    state,
    tEmit: resolveLightTimeEmissionTime(state.tEmit, tObs),
    status: "max-iters",
    converged: false,
    validityFlags: finalValidityFlags,
  });
}
/**
 * One-way light travel time from position r to the observer (at infinity in direction observerDir).
 * Returns travel time [s] = -dot(r, observerDir) / c when r is the body position (star at origin).
 * So t_emit = t_obs - lightTimeDelaySec(...) gives the retarded/emission time.
 */
export function lightTimeDelaySec(r: Vec3, observerDir: Vec3, c: number): number {
  if (!vIsFinite(r) || !vIsFinite(observerDir)) return 0;
  if (!Number.isFinite(c) || c <= 0) return 0;

  const dir = vNormalizeOrZero(observerDir, 1e-15);
  if (vLen(dir) === 0) return 0;

  const z = vDot(r, dir);
  return Number.isFinite(z) ? -z / c : 0;
}

/**
 * Shapiro delay for a point mass at the origin, relative to a reference constant.
 * This returns a small, geometry-dependent timing correction (can be +/-).
 *
 * The additive constant is fixed by the implementation's dimensionless
 * reference geometry. Use differences between epochs; do not interpret the
 * raw return value as a calibrated absolute propagation time.
 */
export function shapiroDelaySec(params: {
  r: Vec3;
  observerDir: Vec3;
  mu: number;
  c: number;
  minImpact?: number;
}): number {
  return evaluateShapiroDelay(params).delaySec;
}

/**
 * Approximate multi-body Shapiro delay as a sum of point-mass terms.
 * This is still a weak-field approximation but captures first-order contributions
 * from multiple gravitating centers.
 */
export function shapiroDelayMultiBodySec(params: {
  rBody: Vec3;
  observerDir: Vec3;
  masses: Array<{ mu: number; r: Vec3 }>;
  c: number;
  minImpact?: number;
}): number {
  return evaluateShapiroDelayMultiBody(params).delaySec;
}

/**
 * Solve for retarded/emission time using a fixed-point iteration:
 * t_obs = t_emit + (light travel time from r(t_emit) to observer), so t_emit = t_obs - totalDelay(r(t_emit)).
 */
export function solveLightTimeCorrectedTime(params: LightTimeSolveInput): number {
  return solveLightTimeCorrectedResult(params).tEmit;
}

export function solveLightTimeCorrectedResult(params: LightTimeSolveInput): LightTimeSolveResult {
  const tObs = params.tObs;
  const settings = normalizeLightTimeSolveSettings(params);

  if (!Number.isFinite(tObs)) {
    return buildLightTimeSolveResult(tObs, {
      status: "invalid-input",
      converged: false,
      iterations: 0,
      maxIters: settings.maxIters,
      tolSec: settings.tolSec,
      usedShapiro: false,
      usedMultiBodyShapiro: false,
      validityFlags: [],
    });
  }
  return solveValidLightTimeCorrectedResult(params, tObs, settings);
}
