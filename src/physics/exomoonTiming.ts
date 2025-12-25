// src/physics/exomoonTiming.ts
//
// Exomoon timing/shape diagnostics and lightweight, data-driven orbit-orientation evolution.
//
// Scientific intent (toy-model but physically motivated):
// - Many exomoon “timing/shape” observables can be expressed (to first order) through geometry:
//   - Transit duration scales approximately as 1 / v⊥, where v⊥ is the projected (sky-plane)
//     speed of the occulter across the stellar disk (for fixed chord length).
//   - Impact parameter b is related to the sky-plane offset perpendicular to the transit chord,
//     normalized by stellar radius.
// - Long-timescale orbit orientation evolution (nodal/apsidal precession, inclination drift) can be
//   represented phenomenologically as linear-in-time changes of classical elements Ω(t), i(t), ω(t).
// - This module does NOT solve N-body dynamics. It provides deterministic helpers that stay cleanly
//   separated from the Kepler solver (which remains in sim.ts/kepler.ts).
//
// Design constraints:
// - No dependency on sim.ts (avoid circular deps).
// - Pure functions, deterministic.
// - Robust handling of non-finite inputs.
// - Results in simulator-native units (length units, seconds, radians).
//
// Key design checks addressed here:
// - Orientation evolution only changes (Ω, i, ω); Kepler solution uses the resulting elements as usual.
// - Angle wrapping/clamping policy is explicit and conservative for an interactive toy model.
// - Speed estimation uses finite differences with a minimum dt policy to avoid numerical noise.
// - Impact parameter diagnostics are documented and a rotation-invariant alternative is provided.

import type { OrbitElements } from "../core/types";
import type { Vec3 } from "./vec3";

import { clamp, wrapTo2Pi } from "../core/units";
import { vIsFinite, vSub } from "./vec3";
import { projectToSky } from "./frames";

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
   * - "2pi": wrap to [0, 2π), convenient for UI display and keeps angles bounded.
   * - "none": leave unwrapped (monotonic), useful for some fits.
   * Default: "2pi".
   */
  wrapAngles?: AngleWrapMode;

  /**
   * If true (default), clamp inclination to [0, π] to remain in a conventional domain.
   *
   * Physical note:
   * - In full dynamics, inclination can pass beyond π with equivalent geometry under a node flip.
   * - For this toy linear drift model we clamp by default to avoid pathological values and keep UI stable.
   */
  clampInc01Pi?: boolean;
};

export type SkyPoint = { x: number; y: number; z: number };

export type SkyPlaneSpeedOptions = {
  /**
   * Finite-difference step size [s]. Must be > 0.
   *
   * Numerics note:
   * - Too small: dominated by floating error + Kepler solver tolerances.
   * - Too large: smears curvature/acceleration (esp. near periapsis for eccentric orbits).
   *
   * If omitted, a conservative default is used (see DEFAULT_DT_SEC).
   */
  dtSec?: number;

  /**
   * If true, compute speed via central difference using t±dt/2.
   * If false, uses forward difference t→t+dt.
   *
   * Central difference is more accurate (O(dt^2)) and symmetric.
   * Default: true.
   */
  central?: boolean;

  /**
   * Minimum dt enforced for numerical stability (seconds).
   * If omitted, DEFAULT_DT_MIN_SEC is used.
   */
  dtMinSec?: number;
};

const DEFAULT_DT_SEC = 2.0;
const DEFAULT_DT_MIN_SEC = 1e-6;

/** Helper: robust finite number check. */
function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function normalizeDtSec(dtSec: unknown, dtMinSec: unknown): number {
  const dt = isFiniteNumber(dtSec) ? dtSec : DEFAULT_DT_SEC;
  const dtMin = isFiniteNumber(dtMinSec) ? dtMinSec : DEFAULT_DT_MIN_SEC;
  if (!Number.isFinite(dt) || dt <= 0) return NaN;
  if (!Number.isFinite(dtMin) || dtMin <= 0) return NaN;
  return Math.max(dtMin, dt);
}

function wrapAngle(a: number, mode: AngleWrapMode): number {
  if (!Number.isFinite(a)) return a;
  return mode === "2pi" ? wrapTo2Pi(a) : a;
}

/**
 * Apply a time-dependent orientation evolution model to orbital elements.
 * Returns a new object; does not mutate input.
 *
 * Only Ω, ω, i are modified. All other fields (a,e,period,t0) are copied as-is.
 *
 * Separation of concerns:
 * - This function is purely “element evolution”.
 * - The Kepler solution (E, ν, r) remains in kepler.ts + sim.ts using the evolved elements.
 */
export function applyOrientationEvolution(base: OrbitElements, tSec: number, evo: OrbitOrientationEvolution | undefined): OrbitElements {
  const enabled = Boolean(evo?.enabled);
  if (!enabled) return { ...base };

  const tRef = isFiniteNumber(evo?.tRef) ? evo!.tRef : 0;
  const dt = Number.isFinite(tSec) ? tSec - tRef : NaN;

  const OmegaDot = isFiniteNumber(evo?.OmegaDot) ? evo!.OmegaDot : 0;
  const omegaDot = isFiniteNumber(evo?.omegaDot) ? evo!.omegaDot : 0;
  const incDot = isFiniteNumber(evo?.incDot) ? evo!.incDot : 0;

  const wrapMode: AngleWrapMode = evo?.wrapAngles ?? "2pi";
  const clampInc = evo?.clampInc01Pi ?? true;

  const OmegaBase = isFiniteNumber(evo?.Omega0) ? evo!.Omega0 : base.Omega;
  const omegaBase = isFiniteNumber(evo?.omega0) ? evo!.omega0 : base.omega;
  const incBase = isFiniteNumber(evo?.inc0) ? evo!.inc0 : base.inc;

  // If tSec is non-finite, keep base values (robust no-op rather than spreading NaNs).
  if (!Number.isFinite(dt)) return { ...base, Omega: wrapAngle(OmegaBase, wrapMode), omega: wrapAngle(omegaBase, wrapMode), inc: clampInc ? clamp(incBase, 0, Math.PI) : incBase };

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
 *
 * Return domain: speed >= 0 or NaN.
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
 * - rAt(tSec) should return inertial position of the body.
 * - observerDir defines the LOS direction and sky basis (via projectToSky).
 *
 * Central difference:
 * - If central=true, uses t±dt/2 (O(dt^2)).
 * - Else uses forward difference (O(dt)).
 *
 * Numerical stability policy:
 * - Enforces dt >= dtMinSec to avoid dt=0 and severe cancellation noise.
 */
export function estimateSkyPlaneSpeed(
  rAt: (tSec: number) => Vec3,
  tSec: number,
  observerDir: Vec3,
  opts: SkyPlaneSpeedOptions | undefined = {}
): number {
  const dt = normalizeDtSec(opts?.dtSec, opts?.dtMinSec);
  const central = opts?.central ?? true;

  if (!Number.isFinite(tSec)) return NaN;
  if (!Number.isFinite(dt) || dt <= 0) return NaN;
  if (!vIsFinite(observerDir)) return NaN;

  const t0 = central ? tSec - 0.5 * dt : tSec;
  const t1 = central ? tSec + 0.5 * dt : tSec + dt;

  const r0 = rAt(t0);
  const r1 = rAt(t1);
  if (!vIsFinite(r0) || !vIsFinite(r1)) return NaN;

  const p0 = projectToSky(r0, observerDir);
  const p1 = projectToSky(r1, observerDir);

  return estimateSkyPlaneSpeedFromSkyPoints(p0, p1, t1 - t0);
}

/**
 * Convenience helper: estimate the sky-plane relative speed |v⊥,rel| between two bodies.
 *
 * Useful for future extensions:
 * - mutual event duration scaling using relative sky speed
 * - planet speed relative to star (use rB(t)=0)
 */
export function estimateRelativeSkyPlaneSpeed(
  rAAt: (tSec: number) => Vec3,
  rBAt: (tSec: number) => Vec3,
  tSec: number,
  observerDir: Vec3,
  opts: SkyPlaneSpeedOptions | undefined = {}
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
    opts
  );
}

/**
 * TDV-like diagnostic ratio under the v⊥ approximation:
 *   TDV_ratio ≡ T(t)/T_ref ≈ v⊥(t_ref) / v⊥(t)
 *
 * Returns NaN if inputs invalid or vNow is too small.
 */
export function tdvRatioFromSkyPlaneSpeeds(vRef: number, vNow: number, eps = 1e-15): number {
  if (!Number.isFinite(vRef) || vRef < 0) return NaN;
  if (!Number.isFinite(vNow) || vNow < eps) return NaN;
  const r = vRef / vNow;
  return Number.isFinite(r) ? r : NaN;
}

/**
 * Impact parameter proxy (chord-aligned):
 *   b ≈ |y| / Rstar
 *
 * Interpretation:
 * - This equals the usual impact parameter when the transit chord is aligned with +x in the chosen
 *   sky-plane coordinates (i.e., the “across-track” direction is x and the “impact” direction is y).
 * - In this simulator that is typically true near transit because motion across the stellar disk is
 *   predominantly along x for the default viewing geometry, but for arbitrary observer directions it
 *   is a *proxy*.
 *
 * Return domain: b >= 0 or NaN.
 */
export function impactParameterFromSkyY(y: number, rStar: number): number {
  if (!Number.isFinite(y)) return NaN;
  if (!Number.isFinite(rStar) || rStar <= 0) return NaN;
  const b = Math.abs(y) / rStar;
  return Number.isFinite(b) ? b : NaN;
}

/**
 * Rotation-invariant alternative diagnostic:
 *   b_radial ≡ ρ / Rstar, where ρ = sqrt(x^2 + y^2)
 *
 * This is NOT the classical impact parameter; it is the normalized projected separation
 * between the body center and the stellar center in the sky plane.
 *
 * Use this when you want a diagnostic invariant under rotations within the sky plane.
 */
export function normalizedSkySeparation(point: { x: number; y: number }, rStar: number): number {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return NaN;
  if (!Number.isFinite(rStar) || rStar <= 0) return NaN;
  const rho = Math.hypot(point.x, point.y);
  const b = rho / rStar;
  return Number.isFinite(b) ? b : NaN;
}

/**
 * Optional phenomenological “impact-parameter drift” as a sky-plane y-shift.
 *
 * This does not alter the Kepler solution; it’s a post-geometry tweak intended for:
 * - UI experiments
 * - controlled tests of how b-drift affects transit shape
 *
 * In most scientific scenarios, b-drift should emerge from evolving Ω(t), i(t),
 * not from an explicit y shift. Use with care.
 */
export function applySkyPlaneImpactYDrift(
  sky: SkyPoint,
  tSec: number,
  model: { enabled?: boolean; tRef?: number; yDot?: number } | undefined
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
