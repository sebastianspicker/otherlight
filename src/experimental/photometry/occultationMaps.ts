// src/experimental/photometry/occultationMaps.ts
//
// Generic 2D occultation / attenuation maps for projected (sky-plane) simulations.
//
// Motivation
// - Hard circular disks are sufficient for solid-body transits, but exospheres, dust tails,
//   rings, and comet-like structures require spatially varying optical depth / transmission.
// - This module provides a small, dependency-light framework to evaluate 2D transmission maps
//   T(x,y) on the sky plane.
//
// Scientific conventions
// - Optical depth τ(x,y) is dimensionless, τ >= 0.
// - Transmission is T(x,y) = exp(-τ(x,y)), thus T ∈ (0,1] for τ>=0.
// - Multiple absorbing structures combine as:
//     τ_total = Σ_i τ_i
//     T_total = exp(-τ_total) = Π_i exp(-τ_i)
//
// Coordinate conventions
// - All geometry is defined in the sky plane of the star: star centered at (0,0).
// - Each map has its own local coordinate transform (translation + rotation).
// - Units are the simulation’s length units (same as rStar, planet.r, etc.).
//
// Design goals
// - Robust: safe guards against NaN/Inf and pathological parameters.
// - Composable: multiple maps can be combined without branching in the integrator.
// - Minimal: no external dependencies.
//
// Integration usage
// - Sample T(x,y) in the same midpoint grid used for disk integrators.
// - For hard disks: a tauInside→∞ map combined via SUM(τ) approximates union-of-occulters
//   (T≈0 if inside ANY occulter).

import { clamp, clamp01 } from "../../core/units";

export type SkyXY = { x: number; y: number };

/**
 * A 2D transmission map on the sky plane.
 *
 * Implementations should return transmission T in [0,1] (best-effort).
 * Returning NaN/Inf is treated as "no effect" by the safe wrappers.
 */
export type TransmissionMap2D = {
  /** Optional name/identifier for UI/debugging. */
  name?: string;

  /** Evaluate transmission at global sky-plane coordinates (x,y). */
  transmissionAt(x: number, y: number): number;
};

/**
 * A 2D optical depth map on the sky plane.
 * Optical depth τ is combined additively; transmission is exp(-τ).
 */
export type OpticalDepthMap2D = {
  name?: string;
  tauAt(x: number, y: number): number;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * exp(-tau) with numerical/physical guards.
 * - tau<0 is non-physical => treated as 0.
 * - non-finite tau => treated as 0.
 */
function safeExpMinusTau(tau: number): number {
  const t = Number.isFinite(tau) ? Math.max(0, tau) : 0;
  const T = Math.exp(-t);
  return Number.isFinite(T) ? T : 1;
}

/**
 * Sanitize a transmission value.
 * - NaN/Inf => 1 (no attenuation).
 * - Optional clamp into [0,1] to keep products well-behaved.
 */
function safeTransmission(T: number, doClamp: boolean): number {
  if (!Number.isFinite(T)) return 1;
  return doClamp ? clamp01(T) : T;
}

/** Convert an optical depth map τ(x,y) into a transmission map T(x,y)=exp(-τ(x,y)). */
export function opticalDepthToTransmissionMap(map: OpticalDepthMap2D): TransmissionMap2D {
  return {
    name: map.name,
    transmissionAt(x: number, y: number): number {
      return safeExpMinusTau(map.tauAt(x, y));
    },
  };
}

/**
 * Combine multiple optical depth maps by summing τ.
 * Scientific meaning: independent absorbers add optical depth: τ_total = Σ τ_i.
 */
export function sumOpticalDepthMaps(maps: OpticalDepthMap2D[], opts?: { clampNonNegative?: boolean }): OpticalDepthMap2D {
  const clampNonNeg = opts?.clampNonNegative !== false;

  return {
    name: "sumOpticalDepthMaps",
    tauAt(x: number, y: number): number {
      let tau = 0;

      for (const m of maps ?? []) {
        if (!m) continue;
        const t = m.tauAt(x, y);
        if (!Number.isFinite(t)) continue;
        tau += t;

        // If it blows up, treat as "no effect" instead of propagating NaN/Inf.
        if (!Number.isFinite(tau)) return 0;
      }

      return clampNonNeg ? Math.max(0, tau) : tau;
    },
  };
}

/**
 * Combine multiple transmission maps by multiplying T.
 * Scientific meaning: independent transmissions multiply: T_total = Π T_i.
 */
export function multiplyTransmissionMaps(maps: TransmissionMap2D[], opts?: { clamp01?: boolean }): TransmissionMap2D {
  const doClamp = opts?.clamp01 !== false;

  return {
    name: "multiplyTransmissionMaps",
    transmissionAt(x: number, y: number): number {
      let T = 1;

      for (const m of maps ?? []) {
        if (!m) continue;
        const Ti = safeTransmission(m.transmissionAt(x, y), doClamp);
        T *= Ti;
        if (T === 0) return 0;
        if (!Number.isFinite(T)) return 1; // fail-safe
      }

      return doClamp ? clamp01(T) : T;
    },
  };
}

/** Rigid transform (translation + rotation) helper for maps. */
export type MapTransform2D = {
  /** Translation of the map origin in global coordinates. */
  x0: number;
  y0: number;

  /**
   * Rotation angle [rad] from map-local axes to global axes.
   * +angle rotates local +x toward global +y.
   */
  angle?: number;
};

function toLocal(x: number, y: number, tr: MapTransform2D): SkyXY {
  const x0 = tr.x0;
  const y0 = tr.y0;
  const a = isFiniteNumber(tr.angle) ? tr.angle : 0;

  const dx = x - x0;
  const dy = y - y0;

  const ca = Math.cos(a);
  const sa = Math.sin(a);

  // Global -> local: rotate by -a
  const xl = ca * dx + sa * dy;
  const yl = -sa * dx + ca * dy;

  return { x: xl, y: yl };
}

/**
 * A circular "hard disk" optical depth map (opaque body) with τ=tauInside inside radius.
 *
 * To emulate an opaque occulter, tauInside should be large (default 1e6), giving T≈0.
 */
export function hardDiskOpticalDepthMap(params: {
  name?: string;
  transform: MapTransform2D;
  r: number;
  tauInside?: number;
}): OpticalDepthMap2D {
  const r = params.r;
  if (!(isFiniteNumber(r) && r > 0)) throw new Error("hardDiskOpticalDepthMap: r must be > 0 and finite.");

  const r2 = r * r;

  // tauInside is "effectively infinite"; keep finite to avoid NaN in sums.
  const tauInside = isFiniteNumber(params.tauInside) ? Math.max(0, params.tauInside) : 1e6;

  return {
    name: params.name ?? "hardDisk",
    tauAt(x: number, y: number): number {
      const p = toLocal(x, y, params.transform);
      const rho2 = p.x * p.x + p.y * p.y;
      if (!Number.isFinite(rho2)) return 0;
      return rho2 <= r2 ? tauInside : 0;
    },
  };
}

/**
 * Radially symmetric exponential halo (opaque core + exponential τ outside).
 *
 * Model:
 * - For ρ <= r0: τ = tauCore (large -> opaque)
 * - For ρ > r0:  τ(ρ) = tau0 * exp(-(ρ - r0)/H)
 */
export function exponentialHaloOpticalDepthMap(params: {
  name?: string;
  transform: MapTransform2D;
  r0: number;
  H: number;
  tau0: number;
  tauCore?: number;
}): OpticalDepthMap2D {
  const r0 = params.r0;
  const H = params.H;
  const tau0 = params.tau0;

  if (!(isFiniteNumber(r0) && r0 > 0)) throw new Error("exponentialHaloOpticalDepthMap: r0 must be > 0 and finite.");
  if (!(isFiniteNumber(H) && H > 0)) throw new Error("exponentialHaloOpticalDepthMap: H must be > 0 and finite.");
  if (!(isFiniteNumber(tau0) && tau0 >= 0)) throw new Error("exponentialHaloOpticalDepthMap: tau0 must be >= 0 and finite.");

  const tauCore = isFiniteNumber(params.tauCore) ? Math.max(0, params.tauCore) : 1e6;

  return {
    name: params.name ?? "exponentialHalo",
    tauAt(x: number, y: number): number {
      const p = toLocal(x, y, params.transform);
      const rho = Math.hypot(p.x, p.y);
      if (!Number.isFinite(rho)) return 0;

      if (rho <= r0) return tauCore;

      const tau = tau0 * Math.exp(-(rho - r0) / H);
      return Number.isFinite(tau) ? Math.max(0, tau) : 0;
    },
  };
}

/**
 * Elliptical Gaussian optical depth blob.
 *
 * Local model:
 * - τ(x,y) = tauPeak * exp(-0.5 * [ (x/σx)^2 + (y/σy)^2 ])
 *
 * cutoffSigma defaults to 6 (~exp(-18) ~ 1.5e-8 factor).
 */
export function ellipticalGaussianOpticalDepthMap(params: {
  name?: string;
  transform: MapTransform2D;
  sigmaX: number;
  sigmaY: number;
  tauPeak: number;
  cutoffSigma?: number;
}): OpticalDepthMap2D {
  const sx = params.sigmaX;
  const sy = params.sigmaY;
  const tauPeak = params.tauPeak;

  if (!(isFiniteNumber(sx) && sx > 0)) throw new Error("ellipticalGaussianOpticalDepthMap: sigmaX must be > 0.");
  if (!(isFiniteNumber(sy) && sy > 0)) throw new Error("ellipticalGaussianOpticalDepthMap: sigmaY must be > 0.");
  if (!(isFiniteNumber(tauPeak) && tauPeak >= 0)) throw new Error("ellipticalGaussianOpticalDepthMap: tauPeak must be >= 0.");

  const invSx2 = 1 / (sx * sx);
  const invSy2 = 1 / (sy * sy);

  const cut = isFiniteNumber(params.cutoffSigma) ? Math.max(0, params.cutoffSigma) : 6;
  const maxX = cut * sx;
  const maxY = cut * sy;

  return {
    name: params.name ?? "ellipticalGaussian",
    tauAt(x: number, y: number): number {
      const p = toLocal(x, y, params.transform);

      // Cheap bounding-box cutoff in local axes:
      if (Math.abs(p.x) > maxX || Math.abs(p.y) > maxY) return 0;

      const q = p.x * p.x * invSx2 + p.y * p.y * invSy2;
      if (!Number.isFinite(q)) return 0;

      const tau = tauPeak * Math.exp(-0.5 * q);
      return Number.isFinite(tau) ? Math.max(0, tau) : 0;
    },
  };
}

/**
 * Comet-like exponential tail optical depth model.
 *
 * Local coordinates:
 * - +x is downstream along tail direction
 * - y is cross-tail direction
 *
 * Model:
 * - τ(x,y) = tau0 * exp(-x/L) * exp(-0.5*(y/σ)^2) for x >= 0
 * - τ(x,y) = 0 for x < 0
 *
 * Performance cutoffs:
 * - cutoffSigmaY defaults to 6, cutoffL defaults to 12 (in units of L).
 */
export function cometTailOpticalDepthMap(params: {
  name?: string;
  transform: MapTransform2D;
  L: number;
  sigmaY: number;
  tau0: number;
  cutoffSigmaY?: number;
  cutoffL?: number;
}): OpticalDepthMap2D {
  const L = params.L;
  const sY = params.sigmaY;
  const tau0 = params.tau0;

  if (!(isFiniteNumber(L) && L > 0)) throw new Error("cometTailOpticalDepthMap: L must be > 0.");
  if (!(isFiniteNumber(sY) && sY > 0)) throw new Error("cometTailOpticalDepthMap: sigmaY must be > 0.");
  if (!(isFiniteNumber(tau0) && tau0 >= 0)) throw new Error("cometTailOpticalDepthMap: tau0 must be >= 0.");

  const invSy2 = 1 / (sY * sY);

  const cutY = isFiniteNumber(params.cutoffSigmaY) ? Math.max(0, params.cutoffSigmaY) : 6;
  const maxY = cutY * sY;

  const cutL = isFiniteNumber(params.cutoffL) ? Math.max(0, params.cutoffL) : 12;
  const maxX = cutL * L;

  return {
    name: params.name ?? "cometTail",
    tauAt(x: number, y: number): number {
      const p = toLocal(x, y, params.transform);

      // Tail exists only for x >= 0 (downstream).
      if (p.x < 0) return 0;
      if (p.x > maxX) return 0;
      if (Math.abs(p.y) > maxY) return 0;

      const along = Math.exp(-p.x / L);
      const cross = Math.exp(-0.5 * (p.y * p.y) * invSy2);

      const tau = tau0 * along * cross;
      return Number.isFinite(tau) ? Math.max(0, tau) : 0;
    },
  };
}

/**
 * Evaluate total transmission at (x,y) from a list of optical depth maps, without allocations.
 */
export function transmissionFromOpticalDepthMapsAt(
  maps: OpticalDepthMap2D[],
  x: number,
  y: number,
  opts?: { clamp01?: boolean }
): number {
  const doClamp = opts?.clamp01 !== false;

  let tau = 0;

  for (const m of maps ?? []) {
    if (!m) continue;
    const t = m.tauAt(x, y);
    if (!Number.isFinite(t)) continue;
    tau += t;

    if (!Number.isFinite(tau)) {
      // Treat numerical blow-ups as "no effect" to keep integrators stable.
      tau = 0;
      break;
    }
  }

  const T = safeExpMinusTau(tau);
  return doClamp ? clamp01(T) : T;
}

/**
 * Evaluate total transmission at (x,y) from a list of transmission maps, without allocations.
 */
export function transmissionFromTransmissionMapsAt(
  maps: TransmissionMap2D[],
  x: number,
  y: number,
  opts?: { clamp01?: boolean }
): number {
  const doClamp = opts?.clamp01 !== false;

  let T = 1;

  for (const m of maps ?? []) {
    if (!m) continue;
    const Ti = safeTransmission(m.transmissionAt(x, y), doClamp);
    T *= Ti;
    if (T === 0) return 0;
    if (!Number.isFinite(T)) return 1;
  }

  return doClamp ? clamp01(T) : T;
}

/** Utility: clamp a parameter intended to represent an optical depth. */
export function sanitizeTau(tau: unknown, fallback = 0): number {
  if (!isFiniteNumber(tau)) return fallback;
  return Math.max(0, tau);
}

/**
 * Utility: clamp a parameter intended to represent a length scale.
 * Note: allows 0 (caller decides if strictly positive is required).
 */
export function sanitizeLengthScale(x: unknown, fallback: number): number {
  if (!isFiniteNumber(x)) return fallback;
  return Math.max(0, x);
}

/**
 * Utility: clamp an angle to a finite number (no wrap policy enforced here).
 * Bounded to avoid huge sin/cos argument growth in some JS engines.
 */
export function sanitizeAngleRad(x: unknown, fallback = 0): number {
  if (!isFiniteNumber(x)) return fallback;
  return clamp(x, -1e6, 1e6);
}
