// src/photometry/transitTransmission.ts
//
// Transmissive / fuzzy-edge transit photometry for a star disk with one or more occulters.
//
// Motivation
// - Existing transit models in this codebase treat occulters as hard opaque disks (binary mask). 
// - Atmospheres/exospheres require semi-transparent attenuation that depends on impact parameter
//   (distance from occulter center in the sky plane) and optionally wavelength.
// - This module provides a robust numeric integrator that computes the stellar flux attenuation
//   by multiplying the local stellar intensity by the transmission through all occulters.
//
// ---------------------------
// Scientific model (explicit)
// ---------------------------
//
// Coordinates and stellar disk:
// - Star is a projected disk of radius R = rStar centered at (0,0) in the sky plane. 
// - Integration is over projected area elements dA in the sky plane (midpoint rule). 
//
// Limb darkening (optional; quadratic):
// - mu(x,y) = sqrt(1 - (x^2 + y^2)/R^2) for points inside the stellar disk.
// - I_LD(mu) = I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2.
// - This file clamps negative intensities to 0 in the integral for robustness.
//
// Brightness patches (optional):
// - P(x,y) multiplies the local stellar intensity (spots/faculae) as a projected map. 
//
// Transmission through occulters (core of this module):
// - Each occulter i defines an axisymmetric transmission profile T_i(rho) where
//   rho = sqrt((x-dx_i)^2 + (y-dy_i)^2).
// - Total transmission at (x,y) is the product (independent attenuators):
//     T_total(x,y) = Π_i T_i(rho_i).
//
// Observed (relative) flux factor (normalized to same star without occulters):
//     F = [∫_star I_LD(mu(x,y)) * P(x,y) * T_total(x,y) dA] / [∫_star I_LD(mu(x,y)) * P(x,y) dA].
//
// Key modeling clarification (opaque core + halo):
// - The transmission model here represents **extra absorption / attenuation** along the line of sight,
//   i.e. it multiplies intensity. It is NOT an “effective larger radius” approximation.
// - A larger effective radius is only an interpretation that may be valid if the halo is thin and
//   nearly opaque up to some impact parameter, but this module computes attenuation directly.
//
// Union-of-occulters consistency:
// - For hard opaque disks where T_i(rho)=0 inside r0 and 1 outside, Π_i T_i is exactly the union mask:
//   the point is blocked if inside ANY occulter (product becomes 0). 
//
// What this does NOT do (by design in this file)
// - Forward scattering brightening (additive component) -> separate module.
// - General limb-darkening laws beyond quadratic -> handled elsewhere (transitLimbDarkened.ts). 
// - Time integration ("cadence smearing") -> handled outside stepSystem. 
//
// Numerics
// - Uses a midpoint Cartesian grid over the star bounding square.
// - Integrates only samples whose (x,y) lie inside the stellar disk.
// - Returns normalized flux factor in [0,1] (best-effort, clamped for robustness).
//
// Performance
// - O(N^2 * N_occulters), where N≈gridRes.
// - Typical gridRes: 128..512 depending on desired accuracy.
//

import type { BrightnessPatch, LimbDarkeningQuadratic } from "../core/types"; // 
import { clamp, clamp01 } from "../core/units"; // 

import { patchFactorAt, sanitizeBrightnessPatches, type PatchCombineMode, type PatchPre } from "./patches"; // shared patches helper

export type TransmissionOcculter = {
  /** Sky-plane offset of occulter center relative to star center (same units as rStar). */
  dx: number;
  dy: number;

  /**
   * Reference opaque radius (solid body).
   * Optional for purely fuzzy occulters; if present, can be used by helper transmission models.
   */
  r0?: number;

  /**
   * Transmission function T(rho) in [0,1], where rho is the sky-plane distance to occulter center.
   * - Must be deterministic and side-effect free.
   * - Should be robust for rho >= 0.
   *
   * If omitted, the occulter defaults to a hard opaque disk of radius r0 (if r0 provided),
   * else it defaults to no effect (T=1).
   */
  transmission?: (rho: number) => number;
};

export type FluxStarWithTransmissionParams = {
  rStar: number;
  occulters: TransmissionOcculter[];

  /**
   * Optional quadratic limb darkening.
   * If omitted, intensity is uniform across the stellar disk.
   */
  limbDarkening?: LimbDarkeningQuadratic;

  /**
   * Optional projected brightness patches on the stellar disk (spots/faculae).
   * These multiply the local intensity (after limb darkening).
   */
  brightnessPatches?: BrightnessPatch[];

  /**
   * Optional patch-combination policy (same meaning as in other photometry integrators).
   * Default: "multiply" (stacked contrast maps, backwards compatible).
   */
  patchCombineMode?: PatchCombineMode;

  /**
   * Spatial grid resolution.
   * Interpreted as roughly the number of samples across the stellar diameter.
   */
  gridRes?: number;

  /**
   * Optional hard clamps for numerical safety.
   * If true (default), transmission values are clamped to [0,1] and final flux to [0,1].
   */
  clamp01?: boolean;
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function safeTransmissionValue(x: number, doClamp: boolean): number {
  if (!Number.isFinite(x)) return 1;
  return doClamp ? clamp01(x) : x;
}

/**
 * Quadratic limb darkening intensity (relative to disk center).
 *
 * Robustness/physics:
 * - If coefficients are NaN/Inf -> returns 1 (uniform).
 * - Negative values can happen for non-physical coefficients; caller clamps to >=0 for integration.
 */
function intensityAtMu(mu: number, ld: LimbDarkeningQuadratic | undefined): number {
  if (!ld) return 1;

  const u1 = ld.u1;
  const u2 = ld.u2;
  if (!Number.isFinite(u1) || !Number.isFinite(u2)) return 1;

  const oneMinusMu = 1 - mu;
  const I = 1 - u1 * oneMinusMu - u2 * oneMinusMu * oneMinusMu;
  return Number.isFinite(I) ? I : 1;
}

function hardDiskTransmission(rho: number, r0: number, doClamp: boolean): number {
  if (!Number.isFinite(rho) || rho < 0) return 1;
  if (!Number.isFinite(r0) || r0 <= 0) return 1;
  const T = rho <= r0 ? 0 : 1;
  return doClamp ? clamp01(T) : T;
}

/**
 * Total transmission T_total(x,y) = Π_i T_i(rho_i).
 *
 * Union-of-occulters consistency:
 * - For hard disks, this product is 0 iff point lies in the union of disks. 
 */
function transmissionAtPoint(
  x: number,
  y: number,
  occulters: TransmissionOcculter[],
  doClamp: boolean
): number {
  if (!occulters || occulters.length === 0) return 1;

  let Ttot = 1;

  for (const o of occulters) {
    if (!o) continue;
    if (!Number.isFinite(o.dx) || !Number.isFinite(o.dy)) continue;

    const dx = x - o.dx;
    const dy = y - o.dy;
    const rho = Math.hypot(dx, dy);

    let Ti = 1;
    if (o.transmission) {
      Ti = safeTransmissionValue(o.transmission(rho), doClamp);
    } else if (isFinitePositive(o.r0)) {
      Ti = hardDiskTransmission(rho, o.r0, doClamp);
    } else {
      Ti = 1;
    }

    Ttot *= Ti;
    if (Ttot === 0) return 0;
  }

  return doClamp ? clamp01(Ttot) : Ttot;
}

/**
 * Compute the normalized stellar flux factor with transmissive/fuzzy occulters.
 *
 * Returns:
 * - A multiplicative attenuation factor in ~[0,1], where 1 is the unobscured star.
 */
export function fluxStarWithTransmissiveOcculters(params: FluxStarWithTransmissionParams): number {
  const rStar = params.rStar;
  if (!isFinitePositive(rStar)) throw new Error("fluxStarWithTransmissiveOcculters: rStar must be > 0 and finite.");

  const doClamp = params.clamp01 !== false;

  // Deterministic, bounded resolution.
  const rawGrid = isFiniteNumber(params.gridRes) ? Math.floor(params.gridRes) : 256;
  const N = clamp(rawGrid, 16, 4096);

  const occulters = params.occulters ?? [];
  const ld = params.limbDarkening;

  // Use shared patch logic for consistency with transitUniformSpots / transitLimbDarkened.
  const patches: PatchPre[] = sanitizeBrightnessPatches(params.brightnessPatches);
  const patchCombineMode: PatchCombineMode = params.patchCombineMode ?? "multiply";

  // Midpoint grid over [-rStar, +rStar] x [-rStar, +rStar]
  const L = 2 * rStar;
  const step = L / N;
  const half = step / 2;

  const rStar2 = rStar * rStar;

  let sumI = 0; // unobscured (with LD + patches)
  let sumIT = 0; // with transmission

  for (let iy = 0; iy < N; iy++) {
    const y = -rStar + half + iy * step;
    const y2 = y * y;

    for (let ix = 0; ix < N; ix++) {
      const x = -rStar + half + ix * step;
      const r2 = x * x + y2;

      if (r2 > rStar2) continue; // outside stellar disk

      // mu = sqrt(1 - (r/R)^2)
      const mu = Math.sqrt(Math.max(0, 1 - r2 / rStar2));

      // Stellar intensity model (relative units).
      let I = intensityAtMu(mu, ld);

      // Apply projected patches multiplicatively (spots/faculae).
      I *= patchFactorAt(x, y, patches, patchCombineMode);

      if (!Number.isFinite(I)) continue;

      // Physical guard: negative intensity is non-physical; clamp to 0 for the integral.
      const Ipos = I > 0 ? I : 0;

      sumI += Ipos;

      const T = transmissionAtPoint(x, y, occulters, doClamp);
      sumIT += Ipos * T;
    }
  }

  if (!(sumI > 0) || !Number.isFinite(sumI) || !Number.isFinite(sumIT)) {
    // If intensity integrates to 0 (pathological coefficients), return 1 as safe fallback.
    return 1;
  }

  const f = sumIT / sumI;
  return doClamp ? clamp01(f) : f;
}

/**
 * Helper to build a hard opaque disk occulter (backwards compatible with Occulter concept).
 */
export function hardDiskOcculter(dx: number, dy: number, r: number): TransmissionOcculter {
  return {
    dx,
    dy,
    r0: r,
    transmission: (rho: number) => (rho <= r ? 0 : 1),
  };
}

/**
 * Helper to build an "opaque core + halo absorption" occulter.
 *
 * Model assumption clarification:
 * - This is **additive absorption** in optical depth outside the core, implemented as multiplicative
 *   transmission T=exp(-tau(rho)) applied to the stellar intensity.
 * - It is not an effective-radius model; the halo contributes partial attenuation at larger rho.
 *
 * Equations:
 * - For rho <= r0:        T(rho) = 0  (opaque core)
 * - For rho >  r0:
 *     tau(rho) = tau0 * exp(-(rho - r0)/h)
 *     T(rho)   = exp(-tau(rho))
 *
 * Parameter effects:
 * - Increasing tau0 decreases T(rho) for all rho>r0, hence decreases integrated flux (deeper transit)
 *   at any time step where the halo overlaps the star.
 */
export function exponentialHaloOcculter(params: {
  dx: number;
  dy: number;
  r0: number;
  h: number;
  tau0: number;
  /**
   * Optional finite cap for tau to avoid Math.exp(-tau) underflow in extreme params.
   * Default: 60 (exp(-60) ~ 8.8e-27 ~ effectively zero for double precision).
   */
  tauMax?: number;
}): TransmissionOcculter {
  const { dx, dy, r0, h, tau0 } = params;
  const tauMax = isFiniteNonNegative(params.tauMax) ? params.tauMax : 60;

  return {
    dx,
    dy,
    r0,
    transmission: (rho: number) => {
      if (!Number.isFinite(rho) || rho < 0) return 1;
      if (!Number.isFinite(r0) || r0 <= 0) return 1;

      // Opaque core:
      if (rho <= r0) return 0;

      const hh = Number.isFinite(h) ? h : NaN;
      const t0 = Number.isFinite(tau0) ? tau0 : NaN;
      if (!(hh > 0) || !(t0 >= 0)) return 1;

      const tau = t0 * Math.exp(-(rho - r0) / hh);
      if (!Number.isFinite(tau) || tau <= 0) return 1;

      const t = Math.min(tau, tauMax);
      const T = Math.exp(-t);
      return Number.isFinite(T) ? T : 1;
    },
  };
}

// ---------------------------
// Minimal built-in tests
// ---------------------------
//
// These tests are dependency-free and safe in both Node and browser builds.
// They are not executed unless runTransitTransmissionSelfTests() is called explicitly.

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`transitTransmission self-test failed: ${msg}`);
}

function approxLe(a: number, b: number, eps = 1e-12): boolean {
  return a <= b + eps;
}

/**
 * Self-tests:
 * - Monotonicity: increasing tau0 in exponentialHaloOcculter should not increase flux
 *   (it should make the transit equal or deeper) for a fixed geometry. [Monotonicity requirement]
 *
 * Usage (optional): call once at startup in dev builds if desired.
 */
export function runTransitTransmissionSelfTests(): void {
  const rStar = 1;
  const gridRes = 400;

  // Place occulter near center so halo overlaps star strongly.
  const dx = 0.2;
  const dy = 0.0;
  const r0 = 0.3;
  const h = 0.15;

  const baseParams = {
    rStar,
    gridRes,
    occulters: [] as TransmissionOcculter[],
    clamp01: true,
  };

  const f0 = fluxStarWithTransmissiveOcculters({
    ...baseParams,
    occulters: [exponentialHaloOcculter({ dx, dy, r0, h, tau0: 0 })],
  });

  const f1 = fluxStarWithTransmissiveOcculters({
    ...baseParams,
    occulters: [exponentialHaloOcculter({ dx, dy, r0, h, tau0: 0.5 })],
  });

  const f2 = fluxStarWithTransmissiveOcculters({
    ...baseParams,
    occulters: [exponentialHaloOcculter({ dx, dy, r0, h, tau0: 2.0 })],
  });

  assert(Number.isFinite(f0) && Number.isFinite(f1) && Number.isFinite(f2), "Flux must be finite.");
  assert(approxLe(f1, f0), "Monotonicity violated: tau0=0.5 should not yield higher flux than tau0=0.");
  assert(approxLe(f2, f1), "Monotonicity violated: tau0=2.0 should not yield higher flux than tau0=0.5.");

  // Union-of-occulters consistency spot-check:
  // For a hard disk at center, flux should be < 1 (transit) and stable.
  const fh = fluxStarWithTransmissiveOcculters({
    rStar,
    gridRes,
    occulters: [hardDiskOcculter(0, 0, 0.3)],
    clamp01: true,
  });
  assert(fh < 1, "Hard-disk occulter should produce a transit (flux<1).");
}
