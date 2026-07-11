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

import { clamp, isFiniteNumber, wrapTo2Pi } from "../core/units";

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

function wrapAngle(a: number, mode: AngleWrapMode): number {
  if (!Number.isFinite(a)) return a;
  return mode === "2pi" ? wrapTo2Pi(a) : a;
}

type OrientationAngles = Pick<OrbitElements, "Omega" | "omega" | "inc">;

type OrientationRates = {
  OmegaDot: number;
  omegaDot: number;
  incDot: number;
};

type OrientationSettings = {
  wrapMode: AngleWrapMode;
  clampInc: boolean;
};

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function orientationSettings(evo: OrbitOrientationEvolution): OrientationSettings {
  return {
    wrapMode: evo.wrapAngles ?? "2pi",
    clampInc: evo.clampInc01Pi ?? true,
  };
}

function orientationRates(evo: OrbitOrientationEvolution): OrientationRates {
  return {
    OmegaDot: finiteOrDefault(evo.OmegaDot, 0),
    omegaDot: finiteOrDefault(evo.omegaDot, 0),
    incDot: finiteOrDefault(evo.incDot, 0),
  };
}

function orientationBaselines(base: OrbitElements, evo: OrbitOrientationEvolution): OrientationAngles {
  return {
    Omega: finiteOrDefault(evo.Omega0, base.Omega),
    omega: finiteOrDefault(evo.omega0, base.omega),
    inc: finiteOrDefault(evo.inc0, base.inc),
  };
}

function normalizedOrientationAngles(
  angles: OrientationAngles,
  settings: OrientationSettings,
): OrientationAngles {
  return {
    Omega: wrapAngle(angles.Omega, settings.wrapMode),
    omega: wrapAngle(angles.omega, settings.wrapMode),
    inc: settings.clampInc ? clamp(angles.inc, 0, Math.PI) : angles.inc,
  };
}

function evolvedOrientationAngles(
  baseAngles: OrientationAngles,
  rates: OrientationRates,
  dt: number,
  settings: OrientationSettings,
): OrientationAngles {
  const inc = baseAngles.inc + rates.incDot * dt;
  return normalizedOrientationAngles(
    {
      Omega: baseAngles.Omega + rates.OmegaDot * dt,
      omega: baseAngles.omega + rates.omegaDot * dt,
      inc: settings.clampInc && Number.isFinite(inc) ? clamp(inc, 0, Math.PI) : inc,
    },
    { ...settings, clampInc: false },
  );
}

/**
 * Apply a time-dependent orientation evolution model to orbital elements.
 * Returns a new object; does not mutate input.
 *
 * Only Ω, ω, i are modified. All other fields are copied as-is.
 */
export function applyOrientationEvolution(
  base: OrbitElements,
  tSec: number,
  evo: OrbitOrientationEvolution | undefined,
): OrbitElements {
  if (!evo?.enabled) return { ...base };

  const settings = orientationSettings(evo);
  const baselines = orientationBaselines(base, evo);
  const tRef = finiteOrDefault(evo.tRef, 0);
  const dt = Number.isFinite(tSec) ? tSec - tRef : NaN;
  const angles = Number.isFinite(dt)
    ? evolvedOrientationAngles(baselines, orientationRates(evo), dt, settings)
    : normalizedOrientationAngles(baselines, settings);

  return { ...base, ...angles };
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
 * Physical front-of-star impact parameter:
 * b = sqrt(x^2 + y^2) / Rstar
 *
 * Only defined when the body is in front of the stellar disk plane (`sky.z > 0`).
 * Behind-star geometry returns NaN so higher-level callers can omit the value.
 */
export function impactParameterFromProjectedSky(sky: SkyPoint | undefined, rStar: number): number {
  if (!isFrontFiniteSkyPoint(sky)) return NaN;
  if (!isPositiveFiniteRadius(rStar)) return NaN;

  const b = Math.hypot(sky.x, sky.y) / rStar;
  return Number.isFinite(b) ? b : NaN;
}

function isFrontFiniteSkyPoint(sky: SkyPoint | undefined): sky is SkyPoint {
  if (!sky) return false;
  return Number.isFinite(sky.x) && Number.isFinite(sky.y) && Number.isFinite(sky.z) && sky.z > 0;
}

function isPositiveFiniteRadius(radius: number): boolean {
  return Number.isFinite(radius) && radius > 0;
}
