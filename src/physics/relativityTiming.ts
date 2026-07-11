// src/physics/relativity.ts
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

const DEFAULT_LTTE_ITERS = 2;
const DEFAULT_LTTE_TOL_SEC = 1e-6;
const DEFAULT_SHAPIRO_MIN_IMPACT = 0;

function buildLightTimeValidityFlags(args: {
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
 * Note: this is a *relative-delay* model only. It computes an absolute Shapiro
 * delay without subtracting a baseline/reference geometry. This is acceptable
 * for differential timing work (e.g., TTV computation) because both the
 * reference and observed epochs receive the same systematic offset, which
 * cancels in the difference. Do not use the raw return value as a calibrated
 * absolute time delay.
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
export function solveLightTimeCorrectedTime(params: {
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
}): number {
  return solveLightTimeCorrectedResult(params).tEmit;
}

export function solveLightTimeCorrectedResult(params: {
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
}): LightTimeSolveResult {
  const tObs = params.tObs;
  const maxItersImplicit = !Number.isFinite(params.maxIters);
  const tolSecImplicit = !Number.isFinite(params.tolSec);
  const maxIters = maxItersImplicit ? DEFAULT_LTTE_ITERS : Math.max(1, Math.floor(params.maxIters!));
  const tolSec = tolSecImplicit ? DEFAULT_LTTE_TOL_SEC : Math.max(0, params.tolSec!);
  const shapiroMinImpact = Number.isFinite(params.shapiro?.minImpact)
    ? Math.max(0, params.shapiro!.minImpact as number)
    : DEFAULT_SHAPIRO_MIN_IMPACT;

  if (!Number.isFinite(tObs)) {
    return {
      tEmit: tObs,
      diagnostics: {
        status: "invalid-input",
        converged: false,
        iterations: 0,
        maxIters,
        tolSec,
        usedShapiro: false,
        usedMultiBodyShapiro: false,
        validityFlags: [],
      },
    };
  }

  const useShapiro = Boolean(params.shapiro?.enabled);
  const useMultiBodyShapiro = typeof params.shapiro?.massesAtTime === "function";
  const validityFlags = buildLightTimeValidityFlags({
    useShapiro,
    useMultiBodyShapiro,
    maxIters,
    maxItersImplicit,
    tolSecImplicit,
    shapiroMinImpact,
  });

  function evaluateDelayAtTime(tEval: number): {
    roemerSec?: number;
    shapiroSec?: number;
    delaySec?: number;
    shapiroImpactFloorEngaged: boolean;
  } {
    const r = params.rAtTime(tEval);
    const roemer = lightTimeDelaySec(r, params.observerDir, params.c);
    let shapiro = 0;
    let shapiroImpactFloorEngaged = false;
    if (useShapiro) {
      const massesAtTime = params.shapiro?.massesAtTime;
      if (typeof massesAtTime === "function") {
        const evaluated = evaluateShapiroDelayMultiBody({
          rBody: r,
          observerDir: params.observerDir,
          masses: massesAtTime(tEval),
          c: params.c,
          minImpact: shapiroMinImpact,
        });
        shapiro = evaluated.delaySec;
        shapiroImpactFloorEngaged = evaluated.impactFloorEngaged;
      } else if (Number.isFinite(params.shapiro?.mu) && (params.shapiro?.mu as number) > 0) {
        const evaluated = evaluateShapiroDelay({
          r,
          observerDir: params.observerDir,
          mu: params.shapiro!.mu as number,
          c: params.c,
          minImpact: shapiroMinImpact,
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

  function computeResidualSec(tEmitFinal: number): number | undefined {
    if (!Number.isFinite(tEmitFinal) || !Number.isFinite(tObs)) return undefined;
    const delay = evaluateDelayAtTime(tEmitFinal).delaySec;
    if (!(typeof delay === "number" && Number.isFinite(delay))) return undefined;
    const residual = Math.abs(tObs - (tEmitFinal + delay));
    return Number.isFinite(residual) ? residual : undefined;
  }

  function withResidualFlags(baseFlags: string[], residualSec: number | undefined): string[] {
    const flags = [...baseFlags];
    if (Number.isFinite(residualSec) && (residualSec as number) > tolSec) {
      flags.push("residual-exceeds-tolerance");
    }
    return flags;
  }

  let tEmit = tObs;
  let iterations = 0;
  let lastRoemer: number | undefined;
  let lastShapiro: number | undefined;
  let lastDelay: number | undefined;
  let sawShapiroImpactFloor = false;
  for (let i = 0; i < maxIters; i++) {
    iterations = i + 1;
    const evaluated = evaluateDelayAtTime(tEmit);
    lastRoemer = evaluated.roemerSec;
    lastShapiro = evaluated.shapiroSec;
    const delay = evaluated.delaySec;
    lastDelay = delay;
    sawShapiroImpactFloor ||= evaluated.shapiroImpactFloorEngaged;
    const dynamicValidityFlags = sawShapiroImpactFloor
      ? [...validityFlags, "shapiro-impact-floor-engaged"]
      : validityFlags;
    if (!(typeof delay === "number" && Number.isFinite(delay))) {
      const residualSec = computeResidualSec(Number.isFinite(tEmit) ? tEmit : tObs);
      return {
        tEmit: Number.isFinite(tEmit) ? tEmit : tObs,
        diagnostics: {
          status: "nonfinite-delay",
          converged: false,
          iterations,
          maxIters,
          tolSec,
          usedShapiro: useShapiro,
          usedMultiBodyShapiro: useMultiBodyShapiro,
          validityFlags: withResidualFlags(dynamicValidityFlags, residualSec),
          roemerSec: lastRoemer,
          shapiroSec: lastShapiro,
          delaySec: lastDelay,
          residualSec,
        },
      };
    }

    const next = tObs - delay;
    if (!Number.isFinite(next)) {
      const residualSec = computeResidualSec(Number.isFinite(tEmit) ? tEmit : tObs);
      return {
        tEmit: Number.isFinite(tEmit) ? tEmit : tObs,
        diagnostics: {
          status: "nonfinite-next",
          converged: false,
          iterations,
          maxIters,
          tolSec,
          usedShapiro: useShapiro,
          usedMultiBodyShapiro: useMultiBodyShapiro,
          validityFlags: withResidualFlags(dynamicValidityFlags, residualSec),
          roemerSec: lastRoemer,
          shapiroSec: lastShapiro,
          delaySec: lastDelay,
          residualSec,
        },
      };
    }
    if (Math.abs(next - tEmit) <= tolSec) {
      const residualSec = computeResidualSec(next);
      return {
        tEmit: next,
        diagnostics: {
          status: "converged",
          converged: true,
          iterations,
          maxIters,
          tolSec,
          usedShapiro: useShapiro,
          usedMultiBodyShapiro: useMultiBodyShapiro,
          validityFlags: withResidualFlags(dynamicValidityFlags, residualSec),
          roemerSec: lastRoemer,
          shapiroSec: lastShapiro,
          delaySec: lastDelay,
          residualSec,
        },
      };
    }
    tEmit = next;
  }

  const finalEmit = Number.isFinite(tEmit) ? tEmit : tObs;
  const residualSec = computeResidualSec(finalEmit);
  const finalValidityFlags = sawShapiroImpactFloor
    ? [...validityFlags, "shapiro-impact-floor-engaged"]
    : validityFlags;
  return {
    tEmit: finalEmit,
    diagnostics: {
      status: "max-iters",
      converged: false,
      iterations,
      maxIters,
      tolSec,
      usedShapiro: useShapiro,
      usedMultiBodyShapiro: useMultiBodyShapiro,
      validityFlags: withResidualFlags(finalValidityFlags, residualSec),
      roemerSec: lastRoemer,
      shapiroSec: lastShapiro,
      delaySec: lastDelay,
      residualSec,
    },
  };
}
