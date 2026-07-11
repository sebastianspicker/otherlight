// src/physics/relativity.ts
//
// Lightweight relativity-inspired timing and precession utilities.
//
// Notes:
// - These are toy-model corrections intended for timing offsets and simple apsidal precession.
// - Speed of light `c` must be provided in SI units (m/s).

import type { OrbitElements } from "../core/types";
import type { RelativityParams } from "../core/typesDynamics";
import { wrapTo2Pi } from "../core/units";
import type { Vec3 } from "./vec3";
import { vDot, vIsFinite, vLen, vNormalizeOrZero } from "./vec3";

export type { RelativityParams };

export type NormalizedRelativityParams = {
  enabled: boolean;
  ltte: boolean;
  grPrecession: boolean;
  shapiro: boolean;
  einsteinDelay: boolean;
  lightBending: boolean;
  c: number;
  timingRefSec: number;
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

const DEFAULT_C = 299_792_458;
const DEFAULT_LTTE_ITERS = 2;
const DEFAULT_LTTE_TOL_SEC = 1e-6;
const DEFAULT_SHAPIRO_MIN_IMPACT = 0;

type RelativityFeatureFlags = Pick<
  NormalizedRelativityParams,
  "enabled" | "ltte" | "grPrecession" | "shapiro" | "einsteinDelay" | "lightBending"
>;

type RelativityScalarDefaults = Omit<NormalizedRelativityParams, keyof RelativityFeatureFlags>;

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function positiveFiniteOrDefault(value: number | undefined, fallback: number): number {
  return isPositiveFinite(value) ? value : fallback;
}

function integerAtLeast(value: number | undefined, fallback: number, min: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.floor(value as number)) : fallback;
}

function nonNegativeFiniteOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

function enabledDefaultTrue(enabled: boolean, value: boolean | undefined): boolean {
  return enabled && (value ?? true);
}

function enabledOptIn(enabled: boolean, value: boolean | undefined): boolean {
  return enabled && Boolean(value);
}

function normalizeRelativityFeatureFlags(params: RelativityParams | undefined): RelativityFeatureFlags {
  const enabled = Boolean(params?.enabled);
  return {
    enabled,
    ltte: enabledDefaultTrue(enabled, params?.ltte),
    grPrecession: enabledDefaultTrue(enabled, params?.grPrecession),
    shapiro: enabledDefaultTrue(enabled, params?.shapiro),
    einsteinDelay: enabledOptIn(enabled, params?.einsteinDelay),
    lightBending: enabledOptIn(enabled, params?.lightBending),
  };
}

function normalizeRelativityScalarDefaults(params: RelativityParams | undefined): RelativityScalarDefaults {
  return {
    c: positiveFiniteOrDefault(params?.c, DEFAULT_C),
    timingRefSec: finiteOrDefault(params?.timingRefSec, 0),
    planetPrecessionPerOrbit: finiteOrDefault(params?.planetPrecessionPerOrbit, 0),
    moonPrecessionPerOrbit: finiteOrDefault(params?.moonPrecessionPerOrbit, 0),
    ltteIters: integerAtLeast(params?.ltteIters, DEFAULT_LTTE_ITERS, 1),
    ltteTolSec: nonNegativeFiniteOrDefault(params?.ltteTolSec, DEFAULT_LTTE_TOL_SEC),
    shapiroMinImpact: nonNegativeFiniteOrDefault(params?.shapiroMinImpact, DEFAULT_SHAPIRO_MIN_IMPACT),
  };
}

/** Merge user-provided relativity config with safe defaults (c, iteration limits, enable flags). */
export function normalizeRelativityParams(params: RelativityParams | undefined): NormalizedRelativityParams {
  return {
    ...normalizeRelativityFeatureFlags(params),
    ...normalizeRelativityScalarDefaults(params),
  };
}

function hasValidEinsteinScalars(params: { mu: number; c: number; tObs: number }): boolean {
  return isPositiveFinite(params.mu) && isPositiveFinite(params.c) && Number.isFinite(params.tObs);
}

function positiveVectorLength(vec: Vec3): number | undefined {
  const length = vLen(vec);
  return Number.isFinite(length) && length > 0 ? length : undefined;
}

function finiteOptionalReference(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Bounded weak-field Einstein-delay surrogate.
 *
 * This is not a full relativistic timing solution. It uses the local weak-field
 * proper-time-rate proxy (v^2/2 + mu/r)/c^2 integrated over (tObs - tRef).
 * Intended for didactic scale arguments only.
 */
export function einsteinDelaySurrogateSec(params: {
  r: Vec3;
  v: Vec3;
  mu: number;
  c: number;
  tObs: number;
  tRef?: number;
}): number {
  const state = resolveEinsteinDelayState(params);
  if (!state) return 0;

  return finiteOrZero(((0.5 * state.v2 + state.mu / state.rMag) / state.c2) * state.dt);
}

function resolveEinsteinDelayState(params: {
  r: Vec3;
  v: Vec3;
  mu: number;
  c: number;
  tObs: number;
  tRef?: number;
}): { mu: number; c2: number; rMag: number; v2: number; dt: number } | null {
  const { r, v, mu, c, tObs } = params;
  if (!vIsFinite(r) || !vIsFinite(v)) return null;
  if (!hasValidEinsteinScalars({ mu, c, tObs })) return null;

  const rMag = positiveVectorLength(r);
  if (rMag === undefined) return null;
  const v2 = vDot(v, v);
  if (!Number.isFinite(v2)) return null;
  const tRef = finiteOptionalReference(params.tRef);
  const dt = tObs - tRef;
  if (!Number.isFinite(dt) || dt === 0) return null;

  return { mu, c2: c * c, rMag, v2, dt };
}

function normalizedDirection(observerDir: Vec3): Vec3 | undefined {
  const dir = vNormalizeOrZero(observerDir, 1e-15);
  return vLen(dir) > 0 ? dir : undefined;
}

function nonNegativeFiniteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

function transverseImpactSq(r: Vec3, dir: Vec3): number | undefined {
  const z = vDot(r, dir);
  const rMag2 = vDot(r, r);
  if (!Number.isFinite(z) || !Number.isFinite(rMag2) || rMag2 <= 0) return undefined;
  return Math.max(0, rMag2 - z * z);
}

/**
 * Weak-field light-bending scale surrogate alpha ≈ 4GM / (b c^2).
 *
 * This is reported as an angular scale only. It does not ray-trace the transit geometry.
 */
export function lightBendingAngleRad(params: {
  r: Vec3;
  observerDir: Vec3;
  mu: number;
  c: number;
  minImpact?: number;
}): number {
  const { r, observerDir, mu, c } = params;
  if (!vIsFinite(r) || !vIsFinite(observerDir)) return 0;
  if (!isPositiveFinite(mu) || !isPositiveFinite(c)) return 0;

  const dir = normalizedDirection(observerDir);
  if (!dir) return 0;

  const impactSq = transverseImpactSq(r, dir);
  if (impactSq === undefined) return 0;
  const minImpact = nonNegativeFiniteOrZero(params.minImpact);
  const b = Math.max(Math.sqrt(impactSq), minImpact, 1e-12);
  const angle = (4 * mu) / (b * c * c);
  return Number.isFinite(angle) ? Math.max(0, angle) : 0;
}

/** Apply GR apsidal precession to orbit elements at time tSec [s]. Returns new elements with advanced omega. */
export function applyApsidalPrecession(
  el: OrbitElements,
  tSec: number,
  precessionPerOrbitRad: number,
): OrbitElements {
  if (!Number.isFinite(precessionPerOrbitRad) || precessionPerOrbitRad === 0) return { ...el };
  if (!Number.isFinite(tSec) || !Number.isFinite(el.period) || el.period <= 0) return { ...el };

  if (Math.abs(precessionPerOrbitRad) > 0.1) {
    console.warn(
      `applyApsidalPrecession: |precessionPerOrbitRad| = ${Math.abs(precessionPerOrbitRad).toFixed(4)} rad (~${((Math.abs(precessionPerOrbitRad) * 180) / Math.PI).toFixed(2)} deg/orbit). ` +
        `The linear secular model may be inaccurate for rates above ~0.1 rad/orbit.`,
    );
  }

  const nOrbits = (tSec - el.t0) / el.period;
  const omega = wrapTo2Pi(el.omega + precessionPerOrbitRad * nOrbits);
  return { ...el, omega };
}

/**
 * One-way light travel time from position r to the observer (at infinity in direction observerDir).
 * Returns travel time [s] = -dot(r, observerDir) / c when r is the body position (star at origin).
 * So t_emit = t_obs - lightTimeDelaySec(...) gives the retarded/emission time.
 */

export {
  grPrecessionPerOrbit,
  lightTimeDelaySec,
  resolveGrPrecessionPerOrbit,
  shapiroDelayMultiBodySec,
  shapiroDelaySec,
  solveLightTimeCorrectedResult,
  solveLightTimeCorrectedTime,
} from "./relativityTiming";
