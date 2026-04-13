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
import { muFromPeriodAndA } from "./kepler";
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

/** Merge user-provided relativity config with safe defaults (c, iteration limits, enable flags). */
export function normalizeRelativityParams(params: RelativityParams | undefined): NormalizedRelativityParams {
  const enabled = Boolean(params?.enabled);
  const ltte = enabled && (params?.ltte ?? true);
  const grPrecession = enabled && (params?.grPrecession ?? true);
  const shapiro = enabled && (params?.shapiro ?? true);
  const einsteinDelay = enabled && Boolean(params?.einsteinDelay);
  const lightBending = enabled && Boolean(params?.lightBending);

  const c = Number.isFinite(params?.c) && (params!.c as number) > 0 ? (params!.c as number) : DEFAULT_C;
  const timingRefSec = Number.isFinite(params?.timingRefSec) ? (params!.timingRefSec as number) : 0;

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
    einsteinDelay,
    lightBending,
    c,
    timingRefSec,
    planetPrecessionPerOrbit,
    moonPrecessionPerOrbit,
    ltteIters,
    ltteTolSec,
    shapiroMinImpact,
  };
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
  const { r, v, mu, c, tObs } = params;
  if (!vIsFinite(r) || !vIsFinite(v)) return 0;
  if (!(Number.isFinite(mu) && mu > 0 && Number.isFinite(c) && c > 0 && Number.isFinite(tObs))) return 0;

  const rMag = vLen(r);
  if (!(Number.isFinite(rMag) && rMag > 0)) return 0;
  const v2 = vDot(v, v);
  if (!Number.isFinite(v2)) return 0;
  const tRef = Number.isFinite(params.tRef) ? (params.tRef as number) : 0;
  const dt = tObs - tRef;
  if (!Number.isFinite(dt) || dt === 0) return 0;

  const c2 = c * c;
  const rate = (0.5 * v2 + mu / rMag) / c2;
  const delay = rate * dt;
  return Number.isFinite(delay) ? delay : 0;
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
  if (!(Number.isFinite(mu) && mu > 0 && Number.isFinite(c) && c > 0)) return 0;

  const dir = vNormalizeOrZero(observerDir, 1e-15);
  if (!(vLen(dir) > 0)) return 0;

  const z = vDot(r, dir);
  const rMag2 = vDot(r, r);
  if (!(Number.isFinite(z) && Number.isFinite(rMag2) && rMag2 > 0)) return 0;
  const impactSq = Math.max(0, rMag2 - z * z);
  const minImpact = Number.isFinite(params.minImpact) ? Math.max(0, params.minImpact as number) : 0;
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
  lightTimeDelaySec,
  shapiroDelayMultiBodySec,
  shapiroDelaySec,
  solveLightTimeCorrectedResult,
  solveLightTimeCorrectedTime,
} from "./relativityTiming";

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
