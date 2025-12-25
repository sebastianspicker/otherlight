// src/physics/secular.ts
//
// Secular / long-timescale orbital element evolution helpers.
//
// Goal:
// - Provide lightweight, deterministic "element provider" functions OrbitElements(t)
//   for use by sim.ts (posFromElements accepts OrbitElements OR OrbitElementsProvider).
// - Model simple long-term trends such as apsidal precession (omegaDot),
//   nodal precession (OmegaDot), inclination drift (incDot), and linear drifts of a/e/period/t0.
//
// Architecture / separation of responsibilities:
// - This module is the “provider factory” layer: it creates OrbitElementsProvider functions.
// - Providers are convenient for programmatic scenarios, but NOT JSON-serializable.
// - Therefore, this module also defines plain-data model types and a generic `apply*` family
//   that can be used by a JSON-driven UI by storing parameters and applying them at runtime.
// - exomoonTiming.ts should remain focused on diagnostics + minimal moon-specific evolution,
//   and may call these `apply*` functions (or mirror them) but should not re-implement a full
//   provider-composition framework.
//
// Scientific scope (intentionally simple):
// - Not an N-body integrator.
// - Kinematic Kepler orbit at each t, with slowly varying elements.
// - Angle wrapping does not change the physical orbit; it only changes representation.
// - Clamps (e, inc) are robustness policies for the rest of the codebase (Kepler solver expects e∈[0,1)).

import type { OrbitElements } from "../core/types";
import { clamp, wrapTo2Pi, wrapToPi } from "../core/units";

export type OrbitElementsProvider = (t: number) => OrbitElements;

/**
 * Angle wrapping mode for generated elements.
 * - "none": do not wrap (may grow without bound).
 * - "pi": wrap to (-π, π] using wrapToPi.
 * - "2pi": wrap to [0, 2π) using wrapTo2Pi.
 */
export type AngleWrapMode = "none" | "pi" | "2pi";

/** Plain-data precession model (JSON-serializable). */
export type PrecessionModel = {
  /** Reference epoch tRef [s] at which base elements are interpreted. Default: 0. */
  tRef?: number;

  /** Apsidal precession rate d(omega)/dt [rad/s]. Default: 0. */
  omegaDot?: number;

  /** Nodal precession rate d(Omega)/dt [rad/s]. Default: 0. */
  OmegaDot?: number;

  /** Inclination drift d(inc)/dt [rad/s]. Default: 0. */
  incDot?: number;

  /**
   * How to wrap omega/Omega in output.
   * Default: "pi" (keeps angles bounded while preserving orbit geometry).
   */
  wrapAngles?: AngleWrapMode;

  /**
   * If true, clamp inclination to [0, π] in the output.
   * Default: false for this generic secular module (less opinionated).
   *
   * Note: Clamping inclination is a UI/robustness choice; a full dynamical model would handle
   * equivalences via node flips rather than clamping.
   */
  clampInc01Pi?: boolean;
};

/** Plain-data drift model (JSON-serializable). */
export type DriftModel = {
  /** Reference epoch tRef [s] at which base elements are interpreted. Default: 0. */
  tRef?: number;

  /** Semi-major axis drift d(a)/dt [units/s]. Default: 0. */
  aDot?: number;

  /**
   * Eccentricity drift d(e)/dt [1/s]. Default: 0.
   * e is clamped to [0, 1) for elliptic Kepler solver compatibility.
   */
  eDot?: number;

  /**
   * Period drift d(P)/dt [s/s] (dimensionless). Default: 0.
   * Warning: period drift without consistent a(t) is phenomenological.
   */
  periodDot?: number;

  /**
   * Periapsis time drift d(t0)/dt [s/s]. Default: 0.
   * This is effectively a phase drift.
   */
  t0Dot?: number;

  /**
   * If true, clamp e to [0, 1-eps). Default: true (protects Kepler solver).
   */
  clampE?: boolean;

  /**
   * Safety margin used when clamping e (prevents e==1). Default: 1e-12.
   */
  eEps?: number;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function wrapAngle(a: number, mode: AngleWrapMode): number {
  if (!Number.isFinite(a)) return a;
  if (mode === "none") return a;
  if (mode === "2pi") return wrapTo2Pi(a);
  return wrapToPi(a);
}

function toFiniteNumber(x: unknown, fallback: number): number {
  return isFiniteNumber(x) ? x : fallback;
}

/**
 * Apply precession (and optional inclination drift) to angular elements at time t.
 * This is the JSON-friendly “pure math” primitive: no provider needed.
 *
 * Only omega, Omega, and optionally inc are modified; all other fields are copied from base.
 */
export function applyPrecessionAtTime(base: OrbitElements, t: number, model: PrecessionModel = {}): OrbitElements {
  const tRef = toFiniteNumber(model.tRef, 0);
  const omegaDot = toFiniteNumber(model.omegaDot, 0);
  const OmegaDot = toFiniteNumber(model.OmegaDot, 0);
  const incDot = toFiniteNumber(model.incDot, 0);
  const wrapMode: AngleWrapMode = model.wrapAngles ?? "pi";
  const clampInc = model.clampInc01Pi ?? false;

  const dt = Number.isFinite(t) ? t - tRef : NaN;

  // If t is non-finite, keep base unchanged (robust no-op; avoids seeding NaNs into sim).
  if (!Number.isFinite(dt)) return { ...base };

  const omega = wrapAngle(base.omega + omegaDot * dt, wrapMode);
  const Omega = wrapAngle(base.Omega + OmegaDot * dt, wrapMode);

  let inc = base.inc + incDot * dt;
  if (clampInc && Number.isFinite(inc)) inc = clamp(inc, 0, Math.PI);

  return { ...base, omega, Omega, inc };
}

/**
 * Apply linear drifts (a,e,period,t0) at time t.
 * JSON-friendly primitive.
 */
export function applyDriftAtTime(base: OrbitElements, t: number, model: DriftModel = {}): OrbitElements {
  const tRef = toFiniteNumber(model.tRef, 0);
  const aDot = toFiniteNumber(model.aDot, 0);
  const eDot = toFiniteNumber(model.eDot, 0);
  const periodDot = toFiniteNumber(model.periodDot, 0);
  const t0Dot = toFiniteNumber(model.t0Dot, 0);

  const clampE = model.clampE ?? true;
  const eEps = clamp(toFiniteNumber(model.eEps, 1e-12), 0, 1e-3);

  const dt = Number.isFinite(t) ? t - tRef : NaN;
  if (!Number.isFinite(dt)) return { ...base };

  const a = base.a + aDot * dt;

  const eRaw = base.e + eDot * dt;
  const e = clampE ? clamp(eRaw, 0, 1 - eEps) : eRaw;

  const period = base.period + periodDot * dt;
  const t0 = base.t0 + t0Dot * dt;

  return { ...base, a, e, period, t0 };
}

/**
 * Create a provider that applies secular precession/drift to angular elements.
 *
 * OrbitElementsProvider compatibility:
 * - sim.ts accepts OrbitElementsProvider directly.
 * - UI cannot serialize the provider function; UI should store `PrecessionModel` and call
 *   applyPrecessionAtTime(...) at runtime, or have main.ts rebuild the provider from params.
 */
export function makePrecessingOrbitProvider(base: OrbitElements, model: PrecessionModel = {}): OrbitElementsProvider {
  // Snapshot base so external mutation does not affect this provider.
  const b: OrbitElements = { ...base };
  return (t: number): OrbitElements => applyPrecessionAtTime(b, t, model);
}

/**
 * Create a provider that applies simple linear drifts to (a, e, period, t0).
 *
 * OrbitElementsProvider compatibility:
 * - Use directly in sim.ts, or rebuild from JSON params at runtime.
 */
export function makeDriftingOrbitProvider(base: OrbitElements, model: DriftModel = {}): OrbitElementsProvider {
  const b: OrbitElements = { ...base };
  return (t: number): OrbitElements => applyDriftAtTime(b, t, model);
}

/**
 * Compose element transformers (JSON-friendly).
 *
 * This is preferred over composing providers when you want to keep the composition itself
 * serializable (store the list of models, not functions).
 */
export type OrbitElementsTransformer = (base: OrbitElements, t: number) => OrbitElements;

/**
 * Apply transformers sequentially at time t: E0 -> E1 -> E2 ...
 */
export function applyOrbitTransformersAtTime(base: OrbitElements, t: number, transformers: OrbitElementsTransformer[]): OrbitElements {
  let cur = { ...base };
  for (const tr of transformers) cur = tr(cur, t);
  return cur;
}

/**
 * Create a provider from transformers.
 *
 * This is the “bridge” between JSON-friendly configuration (transformers built from plain data)
 * and sim.ts runtime consumption (provider function).
 */
export function makeOrbitProviderFromTransformers(base: OrbitElements, transformers: OrbitElementsTransformer[]): OrbitElementsProvider {
  const b = { ...base };
  return (t: number) => applyOrbitTransformersAtTime(b, t, transformers);
}

/**
 * Backwards-compatible provider composition (factory-of-provider style).
 *
 * Note: the previous implementation attempted to “update the base snapshot” by evaluating at t=0.
 * That is often surprising when model.tRef != 0, and can silently change semantics.
 *
 * This version keeps the public signature but makes the behavior explicit:
 * - Each factory is given the original base snapshot.
 * - Providers are evaluated at time t and merged, with later providers taking precedence.
 *
 * If you truly need “provider2 uses provider1(t) as base”, use transformers instead.
 */
export function composeOrbitProviders(
  base: OrbitElements,
  providers: Array<(base: OrbitElements) => OrbitElementsProvider>
): OrbitElementsProvider {
  const b = { ...base };
  const built = providers.map((make) => make(b));

  return (t: number) => {
    let out: OrbitElements = { ...b };
    for (const p of built) {
      const el = p(t);
      // Later providers override fields.
      out = { ...out, ...el };
    }
    return out;
  };
}
