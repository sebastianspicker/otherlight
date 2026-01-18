// src/physics/exomoonTiming.ts
//
// Exomoon timing/shape diagnostics and lightweight, data-driven orbit-orientation evolution.
//
// Scientific intent (toy-model but physically motivated):
// - Transit duration scales approximately as 1 / v⊥, where v⊥ is the projected (sky-plane) speed.
// - Impact parameter diagnostics from sky-plane geometry.
// - Long-timescale orbit orientation evolution (nodal/apsidal precession, inclination drift) can be
//   represented phenomenologically as linear-in-time changes of Ω(t), i(t), ω(t).
//
// Design constraints:
// - No dependency on sim.ts (avoid circular deps).
// - Pure functions, deterministic.
// - Robust handling of non-finite inputs.
// - Results in simulator-native units (length units, seconds, radians).

import type { OrbitElements } from "../core/types";
import type { Vec3 } from "./vec3";

import { clamp, isFiniteNumber, normalizeFiniteDiffDtSec, toFinitePos, wrapTo2Pi } from "../core/units";
import { buildSkyBasis, projectToSkyWithBasis } from "./frames";
import { vIsFinite, vNearlyZero, vNormalizeOrZero, vSub } from "./vec3";

export type AngleWrapMode = "none" | "2pi";

/**
 * Parameters for time-dependent orientation evolution (phenomenological).
 * All rates are per second. Angles are radians.
 */
export type OrbitOrientationEvolution = {
  enabled?: boolean;

  /** Reference epoch for evolution. Default: 0. */
  tRef?: number;

  /** dΩ/dt [rad/s] nodal precession rate. Default: 0. */
  OmegaDot?: number;

  /** dω/dt [rad/s] apsidal precession rate. Default: 0. */
  omegaDot?: number;

  /**
   * di/dt [rad/s] inclination drift. Default: 0.
   * Note: inclination is not periodic; it is optionally clamped to [0, π].
   */
  incDot?: number;

  /**
   * Optional baseline overrides at tRef.
   * If omitted, the corresponding base element value is used.
   */
  Omega0?: number;
  omega0?: number;
  inc0?: number;

  /**
   * Wrap mode for Ω and ω in output.
   * - "2pi": wrap to [0, 2π).
   * - "none": leave unwrapped.
   * Default: "2pi".
   */
  wrapAngles?: AngleWrapMode;

  /**
   * If true (default), clamp inclination to [0, π].
   * For the toy linear drift model this avoids pathological values.
   */
  clampInc01Pi?: boolean;
};

export type SkyPoint = { x: number; y: number; z: number };

export type SkyPlaneSpeedOptions = {
  /** Finite-difference step size [s]. Must be > 0. */
  dtSec?: number;

  /**
   * If true, compute speed via central difference using t±dt/2.
   * If false, uses forward difference t→t+dt.
   * Default: true.
   */
  central?: boolean;

  /** Minimum dt enforced for numerical stability (seconds). */
  dtMinSec?: number;
};

const DEFAULT_DT_SEC = 2.0;
const DEFAULT_DT_MIN_SEC = 1e-6;

function normalizeDtSec(dtSec: unknown, dtMinSec: unknown): number {
  // Base policy (repo-wide): finite, strictly-positive dt with a built-in epsilon.
  const dtBase = normalizeFiniteDiffDtSec(dtSec, DEFAULT_DT_SEC);

  // Optional local floor (can be >= base epsilon).
  const dtMin = toFinitePos(dtMinSec, DEFAULT_DT_MIN_SEC, DEFAULT_DT_MIN_SEC);

  return Math.max(dtMin, dtBase);
}

function wrapAngle(a: number, mode: AngleWrapMode): number {
  if (!Number.isFinite(a)) return a;
  return mode === "2pi" ? wrapTo2Pi(a) : a;
}

function normalizeObserverDirOrNaN(observerDir: Vec3): Vec3 | null {
  if (!vIsFinite(observerDir)) return null;
  const dir = vNormalizeOrZero(observerDir, 1e-15);
  return vNearlyZero(dir, 1e-15) ? null : dir;
}

/**
 * Apply a time-dependent orientation evolution model to orbital elements.
 * Returns a new object; does not mutate input.
 *
 * Only Ω, ω, i are modified. All other fields are copied as-is.
 */
export function applyOrientationEvolution(base: OrbitElements, tSec: number, evo: OrbitOrientationEvolution | undefined): OrbitElements {
  const enabled = Boolean(evo?.enabled);
  if (!enabled) return { ...base };

  const tRef = isFiniteNumber(evo?.tRef) ? evo.tRef : 0;
  const dt = Number.isFinite(tSec) ? tSec - tRef : NaN;

  const OmegaDot = isFiniteNumber(evo?.OmegaDot) ? evo.OmegaDot : 0;
  const omegaDot = isFiniteNumber(evo?.omegaDot) ? evo.omegaDot : 0;
  const incDot = isFiniteNumber(evo?.incDot) ? evo.incDot : 0;

  const wrapMode: AngleWrapMode = evo?.wrapAngles ?? "2pi";
  const clampInc = evo?.clampInc01Pi ?? true;

  const OmegaBase = isFiniteNumber(evo?.Omega0) ? evo.Omega0 : base.Omega;
  const omegaBase = isFiniteNumber(evo?.omega0) ? evo.omega0 : base.omega;
  const incBase = isFiniteNumber(evo?.inc0) ? evo.inc0 : base.inc;

  // If tSec is non-finite, keep base values (robust no-op rather than spreading NaNs).
  if (!Number.isFinite(dt)) {
    return {
      ...base,
      Omega: wrapAngle(OmegaBase, wrapMode),
      omega: wrapAngle(omegaBase, wrapMode),
      inc: clampInc ? clamp(incBase, 0, Math.PI) : incBase,
    };
  }

  const Omega = wrapAngle(OmegaBase + OmegaDot * dt, wrapMode);
  const omega = wrapAngle(omegaBase + omegaDot * dt, wrapMode);

  // Inclination is not periodic; clamp optionally.
  let inc = incBase + incDot * dt;
  if (clampInc && Number.isFinite(inc)) inc = clamp(inc, 0, Math.PI);

  return { ...base, Omega, omega, inc };
}

/**
 * Estimate sky-plane speed |v⊥| from two sky-projected points and a time step.
 * Uses only x,y components (sky plane). z is ignored.
 */
export function estimateSkyPlaneSpeedFromSkyPoints(p0: SkyPoint, p1: SkyPoint, dtSec: number): number {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return NaN;
  if (!Number.isFinite(p0.x) || !Number.isFinite(p0.y) || !Number.isFinite(p1.x) || !Number.isFinite(p1.y)) return NaN;

  const vx = (p1.x - p0.x) / dtSec;
  const vy = (p1.y - p0.y) / dtSec;
  const v = Math.hypot(vx, vy);

  return Number.isFinite(v) ? v : NaN;
}

/**
 * Estimate sky-plane speed |v⊥| for a body given a position function r(t) in inertial coordinates.
 *
 * Central difference:
 * - If central=true, uses t±dt/2.
 * - Else uses forward difference.
 *
 * Numerical stability:
 * - Uses repo-wide dt policy, then enforces dt >= dtMinSec.
 */
export function estimateSkyPlaneSpeed(
  rAt: (tSec: number) => Vec3,
  tSec: number,
  observerDir: Vec3,
  opts: SkyPlaneSpeedOptions | undefined = {},
): number {
  const dt = normalizeDtSec(opts?.dtSec, opts?.dtMinSec);
  const central = opts?.central ?? true;

  if (!Number.isFinite(tSec)) return NaN;
  if (!Number.isFinite(dt) || dt <= 0) return NaN;

  const dir = normalizeObserverDirOrNaN(observerDir);
  if (!dir) return NaN;

  const t0 = central ? tSec - 0.5 * dt : tSec;
  const t1 = central ? tSec + 0.5 * dt : tSec + dt;

  const r0 = rAt(t0);
  const r1 = rAt(t1);
  if (!vIsFinite(r0) || !vIsFinite(r1)) return NaN;

  const basis = buildSkyBasis(dir);
  const p0 = projectToSkyWithBasis(r0, basis);
  const p1 = projectToSkyWithBasis(r1, basis);

  return estimateSkyPlaneSpeedFromSkyPoints(p0, p1, t1 - t0);
}

/** Convenience helper: estimate the sky-plane relative speed |v⊥,rel| between two bodies. */
export function estimateRelativeSkyPlaneSpeed(
  rAAt: (tSec: number) => Vec3,
  rBAt: (tSec: number) => Vec3,
  tSec: number,
  observerDir: Vec3,
  opts: SkyPlaneSpeedOptions | undefined = {},
): number {
  return estimateSkyPlaneSpeed(
    (ti) => {
      const a = rAAt(ti);
      const b = rBAt(ti);
      if (!vIsFinite(a) || !vIsFinite(b)) return { x: NaN, y: NaN, z: NaN };
      return vSub(a, b);
    },
    tSec,
    observerDir,
    opts,
  );
}

/**
 * TDV-like diagnostic ratio under the v⊥ approximation:
 * TDV_ratio ≡ T(t)/T_ref ≈ v⊥(t_ref) / v⊥(t)
 */
export function tdvRatioFromSkyPlaneSpeeds(vRef: number, vNow: number, eps = 1e-15): number {
  if (!Number.isFinite(vRef) || vRef < 0) return NaN;
  if (!Number.isFinite(vNow) || vNow < eps) return NaN;

  const r = vRef / vNow;
  return Number.isFinite(r) ? r : NaN;
}

/**
 * Impact parameter proxy (chord-aligned):
 * b ≈ |y| / Rstar
 */
export function impactParameterFromSkyY(y: number, rStar: number): number {
  if (!Number.isFinite(y)) return NaN;
  if (!Number.isFinite(rStar) || rStar <= 0) return NaN;

  const b = Math.abs(y) / rStar;
  return Number.isFinite(b) ? b : NaN;
}

/**
 * Rotation-invariant alternative diagnostic:
 * b_radial ≡ ρ / Rstar, where ρ = sqrt(x^2 + y^2)
 */
export function normalizedSkySeparation(point: { x: number; y: number }, rStar: number): number {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return NaN;
  if (!Number.isFinite(rStar) || rStar <= 0) return NaN;

  const rho = Math.hypot(point.x, point.y);
  const b = rho / rStar;

  return Number.isFinite(b) ? b : NaN;
}

/** Optional phenomenological “impact-parameter drift” as a sky-plane y-shift. */
export function applySkyPlaneImpactYDrift(
  sky: SkyPoint,
  tSec: number,
  model: { enabled?: boolean; tRef?: number; yDot?: number } | undefined,
): SkyPoint {
  if (!model?.enabled) return sky;
  if (!Number.isFinite(sky.x) || !Number.isFinite(sky.y) || !Number.isFinite(sky.z)) return sky;

  const tRef = isFiniteNumber(model.tRef) ? model.tRef : 0;
  const yDot = isFiniteNumber(model.yDot) ? model.yDot : 0;
  const dt = Number.isFinite(tSec) ? tSec - tRef : NaN;

  if (!Number.isFinite(dt) || !Number.isFinite(yDot) || yDot === 0) return sky;

  const y = sky.y + yDot * dt;
  return { x: sky.x, y, z: sky.z };
}

/* -----------------------------
 * Minimal built-in tests
 * ----------------------------- */

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`exomoonTiming self-test failed: ${msg}`);
}

function approxEq(a: number, b: number, eps = 1e-10): boolean {
  return Math.abs(a - b) <= eps;
}

export function runExomoonTimingSelfTests(): void {
  const base: OrbitElements = {
    a: 1,
    e: 0.1,
    inc: 0.3,
    Omega: 1,
    omega: 2,
    period: 10,
    t0: 0,
  };

  const evo = {
    enabled: true,
    tRef: 0,
    OmegaDot: 0.1,
    omegaDot: -0.2,
    incDot: 0.05,
    wrapAngles: "2pi" as AngleWrapMode,
    clampInc01Pi: true,
  };

  const evolved = applyOrientationEvolution(base, 10, evo);
  assert(approxEq(evolved.Omega, wrapTo2Pi(1 + 1), 1e-12), "Omega evolution mismatch.");
  assert(approxEq(evolved.omega, wrapTo2Pi(2 - 2), 1e-12), "omega evolution mismatch.");
  assert(approxEq(evolved.inc, 0.3 + 0.5, 1e-12), "inc evolution mismatch.");

  const v = estimateSkyPlaneSpeed(
    (t) => ({ x: t, y: 0, z: 0 }),
    0,
    { x: 0, y: 0, z: 1 },
    { dtSec: 1, central: true },
  );
  assert(approxEq(v, 1, 1e-12), "sky-plane speed should be 1 for unit motion.");

  const b = impactParameterFromSkyY(2, 4);
  assert(approxEq(b, 0.5, 1e-12), "impact parameter should be |y|/R.");
}
