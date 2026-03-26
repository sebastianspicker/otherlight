// src/physics/relativity.ts
//
// Lightweight relativity-inspired timing and precession utilities.
//
// Notes:
// - These are toy-model corrections intended for timing offsets and simple apsidal precession.
// - Speed of light `c` must be provided in SI units (m/s).

import type { OrbitElements } from "../core/types";
import { wrapTo2Pi } from "../core/units";
import { muFromPeriodAndA } from "./kepler";
import type { Vec3 } from "./vec3";
import { vDot, vIsFinite, vLen, vNormalizeOrZero } from "./vec3";

export type RelativityParams = {
  enabled?: boolean;
  /** Apply light-travel time effect (LTTE) timing correction. */
  ltte?: boolean;
  /** Apply apsidal precession (toy GR). */
  grPrecession?: boolean;
  /** Apply Shapiro delay (gravitational time delay). */
  shapiro?: boolean;
  /** Speed of light in SI units [m/s]. */
  c?: number;
  /** Planet apsidal precession per orbit [rad/orbit]. */
  planetPrecessionPerOrbit?: number;
  /** Moon apsidal precession per orbit [rad/orbit]. */
  moonPrecessionPerOrbit?: number;
  /** Iterations for LTTE fixed-point solve. */
  ltteIters?: number;
  /** Convergence tolerance for LTTE [s]. */
  ltteTolSec?: number;
  /** Optional minimum impact parameter used to regularize Shapiro delay [m]. */
  shapiroMinImpact?: number;
};

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

const DEFAULT_C = 299_792_458;
const DEFAULT_LTTE_ITERS = 2;
const DEFAULT_LTTE_TOL_SEC = 1e-6;
const DEFAULT_SHAPIRO_MIN_IMPACT = 0;

/** Merge user-provided relativity config with safe defaults (c, iteration limits, enable flags). */
export function normalizeRelativityParams(params: RelativityParams | undefined): NormalizedRelativityParams {
  const enabled = Boolean(params?.enabled);
  const ltte = enabled && (params?.ltte ?? true);
  const grPrecession = enabled && (params?.grPrecession ?? true);
  const shapiro = enabled && (params?.shapiro ?? true);

  const c = Number.isFinite(params?.c) && (params!.c as number) > 0 ? (params!.c as number) : DEFAULT_C;

  const planetPrecessionPerOrbit = Number.isFinite(params?.planetPrecessionPerOrbit)
    ? (params!.planetPrecessionPerOrbit as number)
    : 0;
  const moonPrecessionPerOrbit = Number.isFinite(params?.moonPrecessionPerOrbit)
    ? (params!.moonPrecessionPerOrbit as number)
    : 0;

  const ltteItersRaw = params?.ltteIters;
  const ltteIters = Number.isFinite(ltteItersRaw)
    ? Math.max(1, Math.floor(ltteItersRaw as number))
    : DEFAULT_LTTE_ITERS;

  const ltteTolRaw = params?.ltteTolSec;
  const ltteTolSec = Number.isFinite(ltteTolRaw) ? Math.max(0, ltteTolRaw as number) : DEFAULT_LTTE_TOL_SEC;

  const shapiroMinImpactRaw = params?.shapiroMinImpact;
  const shapiroMinImpact = Number.isFinite(shapiroMinImpactRaw)
    ? Math.max(0, shapiroMinImpactRaw as number)
    : DEFAULT_SHAPIRO_MIN_IMPACT;

  return {
    enabled,
    ltte,
    grPrecession,
    shapiro,
    c,
    planetPrecessionPerOrbit,
    moonPrecessionPerOrbit,
    ltteIters,
    ltteTolSec,
    shapiroMinImpact,
  };
}

/** Apply GR apsidal precession to orbit elements at time tSec [s]. Returns new elements with advanced omega. */
export function applyApsidalPrecession(
  el: OrbitElements,
  tSec: number,
  precessionPerOrbitRad: number,
): OrbitElements {
  if (!Number.isFinite(precessionPerOrbitRad) || precessionPerOrbitRad === 0) return { ...el };
  if (!Number.isFinite(tSec) || !Number.isFinite(el.period) || el.period <= 0) return { ...el };

  const nOrbits = (tSec - el.t0) / el.period;
  const omega = wrapTo2Pi(el.omega + precessionPerOrbitRad * nOrbits);
  return { ...el, omega };
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
  if (!vIsFinite(dir)) return 0;

  const z = vDot(r, dir);
  return Number.isFinite(z) ? -z / c : 0;
}

/**
 * Shapiro delay for a point mass at the origin, relative to a reference constant.
 * This returns a small, geometry-dependent timing correction (can be +/-).
 */
export function shapiroDelaySec(params: {
  r: Vec3;
  observerDir: Vec3;
  mu: number;
  c: number;
  minImpact?: number;
}): number {
  const { r, observerDir, mu, c } = params;
  if (!vIsFinite(r) || !vIsFinite(observerDir)) return 0;
  if (!(Number.isFinite(mu) && mu > 0)) return 0;
  if (!(Number.isFinite(c) && c > 0)) return 0;

  const dir = vNormalizeOrZero(observerDir, 1e-15);
  if (!vIsFinite(dir)) return 0;

  const rMag = vLen(r);
  if (!(rMag > 0) || !Number.isFinite(rMag)) return 0;

  const z = vDot(r, dir);
  const minImpact = Number.isFinite(params.minImpact)
    ? Math.max(0, params.minImpact as number)
    : DEFAULT_SHAPIRO_MIN_IMPACT;
  const minR = Math.max(1e-12, minImpact);
  const rPlusZ = Math.max(rMag + z, minR);

  const arg = rPlusZ / rMag;
  if (!(arg > 0) || !Number.isFinite(arg)) return 0;

  const delay = (2 * mu * Math.log(arg)) / (c * c * c);
  return Number.isFinite(delay) ? delay : 0;
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
  if (!Array.isArray(params.masses) || params.masses.length === 0) return 0;
  let sum = 0;
  for (const m of params.masses) {
    if (!m || !vIsFinite(m.r)) continue;
    const d = shapiroDelaySec({
      r: { x: params.rBody.x - m.r.x, y: params.rBody.y - m.r.y, z: params.rBody.z - m.r.z },
      observerDir: params.observerDir,
      mu: m.mu,
      c: params.c,
      minImpact: params.minImpact,
    });
    if (Number.isFinite(d)) sum += d;
  }
  return Number.isFinite(sum) ? sum : 0;
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
  const tObs = params.tObs;
  if (!Number.isFinite(tObs)) return tObs;

  const maxIters = Number.isFinite(params.maxIters)
    ? Math.max(1, Math.floor(params.maxIters!))
    : DEFAULT_LTTE_ITERS;
  const tolSec = Number.isFinite(params.tolSec) ? Math.max(0, params.tolSec!) : DEFAULT_LTTE_TOL_SEC;

  let tEmit = tObs;
  for (let i = 0; i < maxIters; i++) {
    const r = params.rAtTime(tEmit);
    const roemer = lightTimeDelaySec(r, params.observerDir, params.c);
    const useShapiro = Boolean(params.shapiro?.enabled);
    let shapiro = 0;
    if (useShapiro) {
      const massesAtTime = params.shapiro?.massesAtTime;
      if (typeof massesAtTime === "function") {
        shapiro = shapiroDelayMultiBodySec({
          rBody: r,
          observerDir: params.observerDir,
          masses: massesAtTime(tEmit),
          c: params.c,
          minImpact: params.shapiro?.minImpact,
        });
      } else if (Number.isFinite(params.shapiro?.mu) && (params.shapiro?.mu as number) > 0) {
        shapiro = shapiroDelaySec({
          r,
          observerDir: params.observerDir,
          mu: params.shapiro!.mu as number,
          c: params.c,
          minImpact: params.shapiro?.minImpact,
        });
      }
    }
    const delay = roemer + shapiro;
    if (!Number.isFinite(delay)) break;

    const next = tObs - delay;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - tEmit) <= tolSec) {
      tEmit = next;
      break;
    }
    tEmit = next;
  }

  return Number.isFinite(tEmit) ? tEmit : tObs;
}

/**
 * Resolve GR precession per orbit using the standard weak-field formula if no override is provided.
 * If override is a non-zero finite number, it takes precedence.
 */
export function resolveGrPrecessionPerOrbit(params: {
  orbit: OrbitElements;
  c: number;
  override?: number;
  mu?: number;
}): number {
  const override = params.override;
  if (Number.isFinite(override) && override !== 0) return override as number;

  const orbit = params.orbit;
  if (!(Number.isFinite(orbit.a) && orbit.a > 0 && Number.isFinite(orbit.period) && orbit.period > 0)) {
    return 0;
  }

  const mu =
    Number.isFinite(params.mu) && (params.mu as number) > 0
      ? (params.mu as number)
      : muFromPeriodAndA(orbit.period, orbit.a);

  if (!(Number.isFinite(mu) && mu > 0)) return 0;
  return grPrecessionPerOrbit({ mu, a: orbit.a, e: orbit.e, c: params.c });
}

/**
 * Apsidal precession per orbit from the GR weak-field formula:
 * Δω = 6π * mu / (a (1 - e^2) c^2)
 */
export function grPrecessionPerOrbit(params: { mu: number; a: number; e: number; c: number }): number {
  const { mu, a, e, c } = params;
  if (!(Number.isFinite(mu) && mu > 0)) return 0;
  if (!(Number.isFinite(a) && a > 0)) return 0;
  if (!(Number.isFinite(e) && e >= 0 && e < 1)) return 0;
  if (!(Number.isFinite(c) && c > 0)) return 0;

  const denom = a * (1 - e * e) * c * c;
  if (!(denom > 0) || !Number.isFinite(denom)) return 0;

  return (6 * Math.PI * mu) / denom;
}
